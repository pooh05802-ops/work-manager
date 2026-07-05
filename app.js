import { insaStandard, isLegalHoliday, parseDailySheet, convertToCSV } from './calc.js';

const systemToday = new Date(); 
let currentDate = new Date(systemToday.getFullYear(), systemToday.getMonth(), 1); 

// 로컬 저장소 바인딩 최적화 (불필요한 To-Do 및 테마 컬러 바인딩 데이터 제거)
let attendanceData = JSON.parse(localStorage.getItem('overtime_data_v1.0')) || {};
let globalConfig = JSON.parse(localStorage.getItem('global_work_config_v1.0')) || { startTime: "04:10", endTime: "16:10" };
let holidayConfig = JSON.parse(localStorage.getItem('holiday_work_config_v1.0')) || { startTime: "04:10", endTime: "05:50", useAuto: false };
let currentTheme = localStorage.getItem('app_theme_v1.0') || 'dark';

let gradeHistory = JSON.parse(localStorage.getItem('user_grade_history_v1.0')) || [
    { date: "2026-01-01", grade: "9", hourly: 10949, holiday: 88017 }
];

let selectedDateStr = null;
const todayMidnight = new Date(systemToday.getFullYear(), systemToday.getMonth(), systemToday.getDate());
todayMidnight.setHours(0,0,0,0);
const limitMinDate = new Date(2026, 5, 1); 

// DOM 객체 매핑 정돈 (To-Do 모달 변수 제거)
const daysGrid = document.getElementById('days-grid');
const currentMonthDisplay = document.getElementById('current-month-display');
const timeModal = document.getElementById('time-modal');
const reportModal = document.getElementById('report-modal');
const configListModal = document.getElementById('config-list-modal');
const globalConfigModal = document.getElementById('global-config-modal');

const modalWorkTypeSelect = document.getElementById('modal-work-type');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const modalCustomScheduleInput = document.getElementById('modal-custom-schedule');

const themeSelector = document.getElementById('theme-selector');
const syncToast = document.getElementById('sync-toast');
const gradeHistoryTbody = document.getElementById('grade-history-tbody');

document.addEventListener("DOMContentLoaded", () => {
    init();
});

function init() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeSelector.value = currentTheme;

    document.getElementById('global-cfg-start').value = globalConfig.startTime;
    document.getElementById('global-cfg-end').value = globalConfig.endTime;
    document.getElementById('global-holiday-start').value = holidayConfig.startTime;
    document.getElementById('global-holiday-end').value = holidayConfig.endTime;
    document.getElementById('use-holiday-auto').checked = holidayConfig.useAuto;
    
    // 연월 선택 드롭다운 초기화
    populateExcelDropdowns();

    sortGradeHistory();
    renderGradeHistoryTable();
    renderCalendar();
    updateDashboard();
    setupEventListeners();
    setupSwipeGestures();
}

function populateExcelDropdowns() {
    const ySel = document.getElementById('excel-export-year');
    const mSel = document.getElementById('excel-export-month');
    ySel.innerHTML = ''; mSel.innerHTML = '';
    
    for(let y = 2026; y <= 2030; y++) {
        let opt = document.createElement('option'); opt.value = y; opt.textContent = `${y}년`;
        if(y === currentDate.getFullYear()) opt.selected = true;
        ySel.appendChild(opt);
    }
    for(let m = 1; m <= 12; m++) {
        let opt = document.createElement('option'); opt.value = m - 1; opt.textContent = `${m}월`;
        if((m - 1) === currentDate.getMonth()) opt.selected = true;
        mSel.appendChild(opt);
    }
}

function showToast(msg, duration = 1500) {
    syncToast.textContent = msg;
    syncToast.style.display = "block";
    setTimeout(() => { syncToast.style.display = "none"; }, duration);
}

function getRateForDate(dateStr) {
    let target = new Date(dateStr);
    let activeRate = { grade: "9", hourly: insaStandard["9"].hourly, holiday: insaStandard["9"].holiday };
    for (let i = 0; i < gradeHistory.length; i++) {
        let ruleDate = new Date(gradeHistory[i].date);
        if (target >= ruleDate) {
            activeRate.grade = gradeHistory[i].grade;
            activeRate.hourly = gradeHistory[i].hourly;
            activeRate.holiday = gradeHistory[i].holiday;
        }
    }
    return activeRate;
}

function sortGradeHistory() {
    gradeHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderGradeHistoryTable() {
    gradeHistoryTbody.innerHTML = '';
    gradeHistory.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span style="color:var(--accent-color);">${item.date}</span></td>
            <td><b>${item.grade}급</b></td>
            <td>${item.hourly.toLocaleString()}원</td>
            <td>${item.holiday.toLocaleString()}원</td>
            <td style="text-align:right;"><button type="button" class="btn-mini-del" data-idx="${idx}">×</button></td>
        `;
        tr.querySelector('.btn-mini-del').addEventListener('click', () => {
            gradeHistory.splice(idx, 1);
            localStorage.setItem('user_grade_history_v1.0', JSON.stringify(gradeHistory));
            renderGradeHistoryTable();
            updateDashboard();
            renderCalendar();
        });
        gradeHistoryTbody.appendChild(tr);
    });
}

function getBaseWorkType(year, month, day, dayOfWeek, isHoli) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (attendanceData[dateStr] && attendanceData[dateStr].workType) return attendanceData[dateStr].workType;
    if (dayOfWeek === 1 || (dayOfWeek >= 2 && dayOfWeek <= 5)) {
        const prevStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;
        if (attendanceData[prevStr] && attendanceData[prevStr].isSukjik) return '대휴';
    }
    if (isHoli || dayOfWeek === 6) return '휴일근무';
    if (dayOfWeek === 0) return '휴무';
    return '평일';
}

function getFilteredBaseTime(dateStr, timeType) {
    if (!dateStr) return timeType === 'start' ? globalConfig.startTime : globalConfig.endTime;
    let parts = dateStr.split('-').map(Number);
    let targetDate = new Date(parts[0], parts[1]-1, parts[2]);
    if (targetDate <= todayMidnight) { return "04:10"; }
    return timeType === 'start' ? globalConfig.startTime : globalConfig.endTime;
}

function renderCalendar() {
    daysGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    currentMonthDisplay.textContent = `${year}년 ${String(month + 1).padStart(2, '0')}월`;
    if (year === 2026 && month <= 5) {
        document.getElementById('prev-month').classList.add('disabled');
    } else {
        document.getElementById('prev-month').classList.remove('disabled');
    }

    let firstDayIndex = new Date(year, month, 1).getDay();
    firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 
    const lastDay = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.classList.add('day-cell', 'empty');
        daysGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDay; day++) {
        const dayCell = document.createElement('div');
        dayCell.classList.add('day-cell');
        const cellDate = new Date(year, month, day);
        const dayOfWeek = cellDate.getDay();
        const isHoli = isLegalHoliday(year, month, day);
        
        if (dayOfWeek === 0) dayCell.classList.add('sun');
        if (dayOfWeek === 6) dayCell.classList.add('sat');
        if (isHoli) dayCell.classList.add('holiday');
        if (year === systemToday.getFullYear() && month === systemToday.getMonth() && day === systemToday.getDate()) {
            dayCell.classList.add('today-match');
        }

        if (cellDate <= todayMidnight) dayCell.classList.add('past-day');
        else dayCell.classList.add('future-day');

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dayCell.dataset.date = dateStr;

        let computedType = getBaseWorkType(year, month, day, dayOfWeek, isHoli);
        let saved = attendanceData[dateStr];
        let activeType = saved ? saved.workType : computedType;
        let activeStart = saved ? saved.startTime : "";
        let activeEnd = saved ? saved.endTime : "";
        let isSuk = saved ? saved.isSukjik : false;
        let isIl = saved ? saved.isIljik : false;
        let customScheduleText = saved ? saved.customSchedule : ""; 

        if (cellDate > todayMidnight && saved && saved.isCustomModified) {
            dayCell.classList.add('custom-modified');
        }

        if (!saved) {
            if (activeType === '평일') {
                activeStart = (dayOfWeek === 5) ? "06:00" : getFilteredBaseTime(dateStr, 'start'); 
                activeEnd = (dayOfWeek === 5) ? "15:00" : getFilteredBaseTime(dateStr, 'end'); 
            } else if (activeType === '휴일근무' && cellDate > todayMidnight && holidayConfig.useAuto && (dayOfWeek === 6 || isHoli) && dayOfWeek !== 0) {
                activeStart = holidayConfig.startTime;
                activeEnd = holidayConfig.endTime;
            }
        }

        let classDecorator = "";
        if (activeType === '휴일근무') classDecorator = "theme-badge-holiday";
        else if (['휴무', '연가', '대휴', '특가', '공가'].includes(activeType)) classDecorator = "theme-badge-leave";
        else if (['조퇴', '지각', '오전', '오후'].includes(activeType)) classDecorator = "theme-badge-early";

        let displayTag = (activeType !== '평일') ? `<span class="mini-type-tag ${classDecorator}">${activeType}</span>` : '';
        let scheduleTag = customScheduleText ? `<span class="mini-type-tag theme-badge-schedule">${customScheduleText}</span>` : '';

        let metrics = parseDailySheet(dateStr, activeType, activeStart, activeEnd);
        let midTimeHtml = metrics.timeText ? `<div class="day-mid-time theme-text-workhours">${metrics.timeText.replace(' ', '')}</div>` : `<div class="day-mid-time" style="visibility:hidden;">-</div>`;

        dayCell.innerHTML = `
            <div class="day-top-row"><span class="num">${day}</span>${displayTag}</div>
            <div class="duty-line">
                ${isSuk ? `<span class="mini-duty-badge">숙직</span>` : ''}
                ${isIl ? `<span class="mini-duty-badge iljik">일직</span>` : ''}
                ${scheduleTag}
            </div>
            ${midTimeHtml}
            <div class="day-bottom-row">
                ${metrics.breakfast > 0 ? `<span class="mini-meal-item">☕</span>` : ''}
                ${metrics.lunch > 0 ? `<span class="mini-meal-item">🍱</span>` : ''}
            </div>
        `;

        dayCell.addEventListener('click', () => openTimeModal(dateStr, day, dayOfWeek, isHoli));
        daysGrid.appendChild(dayCell);
    }
}

function updateDashboard() {
    const year = currentDate.getFullYear();
    const monthIdx = currentDate.getMonth();
    const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();

    let actualOvertimeMins = 0; let predictedOvertimeMins = 0; 
    let fullMonthHolidayCount = 0; let bf1Count = 0; let bf2Count = 0; let rawLunchCount = 0;
    let countNormal = 0; let countHolidayWork = 0; let countHuumu = 0;
    let totalHolidayPay = 0;
    let lastDayStr = `${prefix}-${String(totalDays).padStart(2, '0')}`;
    let lastDayRate = getRateForDate(lastDayStr);

    for (let d = 1; d <= totalDays; d++) {
        const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
        const checkDate = new Date(year, monthIdx, d);
        const dayOfWeek = checkDate.getDay();
        const isHoli = isLegalHoliday(year, monthIdx, d);

        let currentType = getBaseWorkType(year, monthIdx, d, dayOfWeek, isHoli);
        let saved = attendanceData[dStr];
        let startVal = saved ? saved.startTime : "";
        let endVal = saved ? saved.endTime : "";

        if (!saved) {
            if (currentType === '평일') { 
                startVal = (dayOfWeek === 5) ? "06:00" : getFilteredBaseTime(dStr, 'start'); 
                endVal = (dayOfWeek === 5) ? "15:00" : getFilteredBaseTime(dStr, 'end'); 
            } else if (currentType === '휴일근무' && checkDate > todayMidnight && holidayConfig.useAuto && (dayOfWeek === 6 || isHoli) && dayOfWeek !== 0) {
                startVal = holidayConfig.startTime;
                endVal = holidayConfig.endTime;
            }
        }

        let metrics = parseDailySheet(dStr, currentType, startVal, endVal);
        let dayRate = getRateForDate(dStr); 

        if (checkDate <= todayMidnight) actualOvertimeMins += metrics.overtimeMins; 
        predictedOvertimeMins += metrics.overtimeMins;
        
        if (d <= 15) bf1Count += metrics.breakfast; else bf2Count += metrics.breakfast;
        rawLunchCount += metrics.lunch;
        
        if (currentType === '휴일근무') {
            fullMonthHolidayCount++;
            totalHolidayPay += dayRate.holiday;
        }
        
        if (currentType === '평일' || ['조퇴', '지각', '오전', '오후'].includes(currentType)) countNormal++;
        else if (currentType === '휴일근무') countHolidayWork++;
        else if (['휴무', '연가', '대휴', '특가', '공가'].includes(currentType)) countHuumu++;
    }

    document.getElementById('dash-total-overtime').textContent = `${Math.floor(actualOvertimeMins / 60)}H ${String(actualOvertimeMins % 60).padStart(2, '0')}M`;
    document.getElementById('dash-predicted-overtime').textContent = `(예상 ${Math.floor(predictedOvertimeMins / 60)}h${String(predictedOvertimeMins % 60).padStart(2, '0')}m)`;
    document.getElementById('dash-day-distribution').innerHTML = `평일 ${countNormal}<span class="dot-split">·</span>휴일 ${countHolidayWork}<span class="dot-split">·</span>휴무 ${countHuumu}`;

    let limitedActualOvertimeMins = Math.min(actualOvertimeMins, 50 * 60); 
    let lh = Math.floor(limitedActualOvertimeMins / 60);
    let finalCalculatedOvertimePay = (lh + 10) * lastDayRate.hourly;

    document.getElementById('rep-actual-overtime').textContent = `${Math.floor(actualOvertimeMins / 60)}H ${String(actualOvertimeMins % 60).padStart(2, '0')}M (실적인정: ${lh}H)`;
    document.getElementById('rep-hourly-rate').textContent = `${lastDayRate.grade}급 기준 ${lastDayRate.hourly.toLocaleString()}원`;
    document.getElementById('rep-overtime-amount').textContent = `${(Math.floor(finalCalculatedOvertimePay / 10) * 10).toLocaleString()}원`;
    document.getElementById('rep-holiday-count').textContent = `${fullMonthHolidayCount}일`;
    document.getElementById('rep-holiday-rate-label').textContent = `${lastDayRate.grade}급 기준 ${lastDayRate.holiday.toLocaleString()}원`;
    document.getElementById('rep-holiday-amount').textContent = `${(Math.floor(totalHolidayPay / 10) * 10).toLocaleString()}원`;

    let limitedLunchCount = Math.min(rawLunchCount, 20);
    document.getElementById('rep-bf1-val').textContent = `${bf1Count}개 = ${(bf1Count * 9000).toLocaleString()}원`;
    document.getElementById('rep-bf2-val').textContent = `${bf2Count}개 = ${(bf2Count * 9000).toLocaleString()}원`;
    document.getElementById('rep-lunch-val').textContent = `${limitedLunchCount}개 / 20개 한도 = ${(limitedLunchCount * 9000).toLocaleString()}원`;
}

function openTimeModal(dateStr, dayNum, dayOfWeek, isHoli) {
    selectedDateStr = dateStr;
    document.getElementById('modal-date-day').textContent = dayNum;
    document.getElementById('modal-date-month-year').textContent = `${currentDate.getMonth() + 1}월`;
    document.getElementById('modal-date-weekday').textContent = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek];

    let saved = attendanceData[dateStr];
    modalWorkTypeSelect.value = saved ? saved.workType : getBaseWorkType(currentDate.getFullYear(), currentDate.getMonth(), dayNum, dayOfWeek, isHoli);
    modalCustomScheduleInput.value = (saved && saved.customSchedule) ? saved.customSchedule : ""; 
    
    applyTimeInputRules(modalWorkTypeSelect.value, dateStr);
    updateModalLivePreview();
    timeModal.classList.add('open');
}

function applyTimeInputRules(type, targetDateStr) {
    startTimeInput.disabled = false; endTimeInput.disabled = false;
    let saved = attendanceData[targetDateStr];
    let isFriday = false; let dayOfWeek = -1; let isHoli = false;

    if (targetDateStr) {
        let dParts = targetDateStr.split('-').map(Number);
        let checkDate = new Date(dParts[0], dParts[1]-1, dParts[2]);
        dayOfWeek = checkDate.getDay();
        if (dayOfWeek === 5) isFriday = true;
        isHoli = isLegalHoliday(dParts[0], dParts[1]-1, dParts[2]);
    }

    switch (type) {
        case '평일':
            if (saved && saved.startTime) { startTimeInput.value = saved.startTime; endTimeInput.value = saved.endTime; } 
            else { startTimeInput.value = isFriday ? "06:00" : getFilteredBaseTime(targetDateStr, 'start'); endTimeInput.value = isFriday ? "15:00" : getFilteredBaseTime(targetDateStr, 'end'); }
            break;
        case '휴일근무':
            if (saved && saved.startTime) { startTimeInput.value = saved.startTime; endTimeInput.value = saved.endTime; } 
            else {
                let parts = targetDateStr.split('-').map(Number);
                let cellDate = new Date(parts[0], parts[1]-1, parts[2]);
                if (cellDate > todayMidnight && holidayConfig.useAuto && (dayOfWeek === 6 || isHoli) && dayOfWeek !== 0) {
                    startTimeInput.value = holidayConfig.startTime; endTimeInput.value = holidayConfig.endTime;
                } else { startTimeInput.value = ""; endTimeInput.value = ""; }
            }
            break;
        case '조퇴':
            startTimeInput.value = (saved && saved.startTime) ? saved.startTime : "06:00"; endTimeInput.value = "12:00"; endTimeInput.disabled = true; break;
        case '지각':
            startTimeInput.value = "08:00"; startTimeInput.disabled = true; endTimeInput.value = (saved && saved.endTime) ? saved.endTime : "15:00"; break;
        case '오전':
            startTimeInput.value = "10:00"; startTimeInput.disabled = true; endTimeInput.value = (saved && saved.endTime) ? saved.endTime : "15:00"; break;
        case '오후':
            startTimeInput.value = (saved && saved.startTime) ? saved.startTime : "06:00"; endTimeInput.value = "10:00"; endTimeInput.disabled = true; break;
        default: 
            startTimeInput.value = ""; endTimeInput.value = ""; startTimeInput.disabled = true; endTimeInput.disabled = true; break;
    }
}

function updateModalLivePreview() {
    let res = parseDailySheet(selectedDateStr, modalWorkTypeSelect.value, startTimeInput.value, endTimeInput.value);
    document.getElementById('preview-overtime').textContent = res.timeText ? res.timeText : "0H 00M";
    document.getElementById('preview-meals').textContent = `조식 ${res.breakfast} / 급량 ${res.lunch}`;
}

function initDayContainer(dateStr, fallbackType = "평일") {
    if (!attendanceData[dateStr]) {
        let parts = dateStr.split('-').map(Number);
        let cellDate = new Date(parts[0], parts[1]-1, parts[2]);
        let targetDayOfWeek = cellDate.getDay();
        let isHoli = isLegalHoliday(parts[0], parts[1]-1, parts[2]);

        let st = ""; let et = "";
        if (fallbackType === "평일") {
            st = (targetDayOfWeek === 5) ? "06:00" : getFilteredBaseTime(dateStr, 'start');
            et = (targetDayOfWeek === 5) ? "15:00" : getFilteredBaseTime(dateStr, 'end');
        } else if (fallbackType === "휴일근무" && cellDate > todayMidnight && holidayConfig.useAuto && (targetDayOfWeek === 6 || isHoli) && targetDayOfWeek !== 0) {
            st = holidayConfig.startTime; et = holidayConfig.endTime;
        }

        attendanceData[dateStr] = {
            workType: fallbackType, startTime: st, endTime: et,
            isSukjik: false, isIljik: false, customSchedule: "", overtimeMins: 0, breakfast: 0, lunch: 0, isCustomModified: false
        };
    }
}

function syncAndRefresh(dateStr) {
    let item = attendanceData[dateStr];
    if (item) {
        let res = parseDailySheet(dateStr, item.workType, item.startTime, item.endTime);
        item.overtimeMins = res.overtimeMins; item.breakfast = res.breakfast; item.lunch = res.lunch; item.overtimeText = res.timeText;
    }
    localStorage.setItem('overtime_data_v1.0', JSON.stringify(attendanceData));
    renderCalendar(); updateDashboard();
}

function openConfigListModal() {
    const injector = document.getElementById('config-rows-injector');
    injector.innerHTML = '';
    const year = currentDate.getFullYear(); const monthIdx = currentDate.getMonth();
    const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    const weekdaysText = ['일', '월', '화', '수', '목', '금', '토'];

    for (let d = 1; d <= totalDays; d++) {
        const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
        const cellDate = new Date(year, monthIdx, d);
        const dayOfWeek = cellDate.getDay();
        const isHoli = isLegalHoliday(year, monthIdx, d);

        let saved = attendanceData[dStr];
        let activeType = saved ? saved.workType : getBaseWorkType(year, monthIdx, d, dayOfWeek, isHoli);
        let isSuk = saved ? saved.isSukjik : false;
        let isIl = saved ? saved.isIljik : false;

        const row = document.createElement('div');
        row.classList.add('config-row');
        let textColor = "var(--text-main)";
        if(dayOfWeek===0 || isHoli) textColor = "#ff4a4a"; else if(dayOfWeek===6) textColor = "#4a90e2";

        row.innerHTML = `
            <div class="config-date-label" style="color: ${textColor};">${d}일(${weekdaysText[dayOfWeek]})</div>
            <div class="config-main-controls">
                <div>
                    <select class="config-select" data-date="${dStr}">
                        <option value="평일" ${activeType==='평일'?'selected':''}>평일</option>
                        <option value="휴일근무" ${activeType==='휴일근무'?'selected':''}>휴일근무</option>
                        <option value="휴무" ${activeType==='휴무'?'selected':''}>휴무</option>
                        <option value="대휴" ${activeType==='대휴'?'selected':''}>대휴</option>
                        <option value="연가" ${activeType==='연가'?'selected':''}>연가</option>
                        <option value="특가" ${activeType==='특가'?'selected':''}>특가</option>
                        <option value="공가" ${activeType==='공가'?'selected':''}>공가</option>
                        <option value="조퇴" ${activeType==='조퇴'?'selected':''}>조퇴</option>
                        <option value="지각" ${activeType==='지각'?'selected':''}>지각</option>
                        <option value="오후" ${activeType==='오후'?'selected':''}>오후</option>
                        <option value="오전" ${activeType==='오전'?'selected':''}>오전</option>
                    </select>
                </div>
                <div class="config-duty-block">
                    <label class="config-check-lbl lbl-sook"><input type="checkbox" class="suk-chk" data-date="${dStr}" ${isSuk?'checked':''}> 숙직</label>
                    <label class="config-check-lbl lbl-il"><input type="checkbox" class="il-chk" data-date="${dStr}" ${isIl?'checked':''}> 일직</label>
                </div>
            </div>
        `;

        row.querySelector('.config-select').addEventListener('change', (e) => {
            initDayContainer(dStr);
            attendanceData[dStr].workType = e.target.value;
            attendanceData[dStr].isCustomModified = false;

            if (e.target.value === '평일') { 
                attendanceData[dStr].startTime = (dayOfWeek === 5) ? "06:00" : getFilteredBaseTime(dStr, 'start'); 
                attendanceData[dStr].endTime = (dayOfWeek === 5) ? "15:00" : getFilteredBaseTime(dStr, 'end'); 
            } else if (e.target.value === '휴일근무') {
                if (cellDate > todayMidnight && holidayConfig.useAuto && (dayOfWeek === 6 || isHoli) && dayOfWeek !== 0) {
                    attendanceData[dStr].startTime = holidayConfig.startTime; attendanceData[dStr].endTime = holidayConfig.endTime;
                } else { attendanceData[dStr].startTime = ""; attendanceData[dStr].endTime = ""; }
            } else if (['조퇴','지각','오전','오후'].includes(e.target.value)) {
                if(e.target.value==='조퇴'){ attendanceData[dStr].startTime="06:00"; attendanceData[dStr].endTime="12:00"; }
                else if(e.target.value==='지각'){ attendanceData[dStr].startTime="08:00"; attendanceData[dStr].endTime="15:00"; }
                else if(e.target.value==='오전'){ attendanceData[dStr].startTime="10:00"; attendanceData[dStr].endTime="15:00"; }
                else if(e.target.value==='오후'){ attendanceData[dStr].startTime="06:00"; attendanceData[dStr].endTime="10:00"; }
            } else { attendanceData[dStr].startTime = ""; attendanceData[dStr].endTime = ""; }
            syncAndRefresh(dStr);
        });

        row.querySelector('.suk-chk').addEventListener('change', (e) => { initDayContainer(dStr); attendanceData[dStr].isSukjik = e.target.checked; syncAndRefresh(dStr); });
        row.querySelector('.il-chk').addEventListener('change', (e) => { initDayContainer(dStr); attendanceData[dStr].isIljik = e.target.checked; syncAndRefresh(dStr); });
        injector.appendChild(row);
    }
    configListModal.classList.add('open');
}

function moveMonth(offset) {
    let nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
    if (nextMonth < limitMinDate) {
        showToast("2026년 06월 이전으로는 이동할 수 없습니다. ⚠️");
        return;
    }
    currentDate = nextMonth;
    renderCalendar(); updateDashboard();
    populateExcelDropdowns();
}

function setupSwipeGestures() {
    const zone = document.getElementById('calendar-swipe-zone');
    let touchStartX = 0; let touchEndX = 0;
    zone.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    zone.addEventListener('touchend', (e) => { touchEndX = e.changedTouches[0].screenX; const threshold = 50; if (touchStartX - touchEndX > threshold) moveMonth(1); else if (touchEndX - touchStartX > threshold) moveMonth(-1); }, { passive: true });
}

function setupEventListeners() {
    // To-Do 관련 토글 및 조작 이벤트가 HTML 소스코드에 맞춰 안전하게 삭제되었습니다.

    document.getElementById('trigger-report-popup').addEventListener('click', () => reportModal.classList.add('open'));
    document.getElementById('trigger-config-popup').addEventListener('click', () => openConfigListModal());
    document.getElementById('trigger-global-config').addEventListener('click', () => globalConfigModal.classList.add('open'));
    
    document.getElementById('close-report-modal').addEventListener('click', () => reportModal.classList.remove('open'));
    document.getElementById('close-config-modal').addEventListener('click', () => configListModal.classList.remove('open'));
    document.getElementById('close-time-modal').addEventListener('click', () => timeModal.classList.remove('open'));
    document.getElementById('close-global-modal').addEventListener('click', () => globalConfigModal.classList.remove('open'));

    currentMonthDisplay.addEventListener('click', () => {
        currentDate = new Date(systemToday.getFullYear(), systemToday.getMonth(), 1);
        renderCalendar(); updateDashboard(); populateExcelDropdowns();
    });

    document.getElementById('btn-export-data').addEventListener('click', () => {
        const backupBundle = {
            attendanceData: attendanceData,
            globalConfig: globalConfig,
            holidayConfig: holidayConfig,
            gradeHistory: gradeHistory,
            exportTime: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backupBundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `근무기록_백업_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        showToast("근무 데이터 파일이 안전하게 내보내기 되었습니다! 💾");
    });

    document.getElementById('btn-trigger-import').addEventListener('click', () => {
        document.getElementById('file-import-json').click();
    });

    document.getElementById('file-import-json').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                if (imported.attendanceData) {
                    attendanceData = imported.attendanceData;
                    globalConfig = imported.globalConfig || globalConfig;
                    holidayConfig = imported.holidayConfig || holidayConfig;
                    gradeHistory = imported.gradeHistory || gradeHistory;
                    
                    localStorage.setItem('overtime_data_v1.0', JSON.stringify(attendanceData));
                    localStorage.setItem('global_work_config_v1.0', JSON.stringify(globalConfig));
                    localStorage.setItem('holiday_work_config_v1.0', JSON.stringify(holidayConfig));
                    localStorage.setItem('user_grade_history_v1.0', JSON.stringify(gradeHistory));

                    showToast("기록 복구가 완벽히 성공했습니다! 🎉");
                    init();
                    globalConfigModal.classList.remove('open');
                } else { alert("올바른 근무관리 백업 파일이 아닙니다."); }
            } catch(err) { alert("파일 파싱 중 오류가 발생했습니다."); }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-export-excel').addEventListener('click', () => {
        const selY = parseInt(document.getElementById('excel-export-year').value);
        const selM = parseInt(document.getElementById('excel-export-month').value);
        const csvString = convertToCSV(selY, selM, attendanceData);
        
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `근무현황_정산_${selY}년_${String(selM+1).padStart(2,'0')}월.csv`;
        a.click();
        showToast(`${selY}년 ${selM+1}월 엑셀용 파일이 다운로드되었습니다. 📊`);
    });

    document.getElementById('btn-add-history').addEventListener('click', () => {
        let dStr = document.getElementById('new-hist-date').value;
        let gr = document.getElementById('new-hist-grade').value;
        let hInput = document.getElementById('new-hist-hourly').value;
        let holInput = document.getElementById('new-hist-holiday').value;
        if(!dStr) { alert("날짜를 선택해주세요."); return; }
        
        let hVal = hInput ? parseInt(hInput) : insaStandard[gr].hourly;
        let holVal = holInput ? parseInt(holInput) : insaStandard[gr].holiday;

        gradeHistory = gradeHistory.filter(item => item.date !== dStr);
        gradeHistory.push({ date: dStr, grade: gr, hourly: hVal, holiday: holVal });
        sortGradeHistory();
        localStorage.setItem('user_grade_history_v1.0', JSON.stringify(gradeHistory));
        renderGradeHistoryTable(); updateDashboard(); renderCalendar();
    });

    document.getElementById('btn-save-global-settings').addEventListener('click', () => {
        currentTheme = themeSelector.value;
        globalConfig.startTime = document.getElementById('global-cfg-start').value;
        globalConfig.endTime = document.getElementById('global-cfg-end').value;
        holidayConfig.startTime = document.getElementById('global-holiday-start').value;
        holidayConfig.endTime = document.getElementById('global-holiday-end').value;
        holidayConfig.useAuto = document.getElementById('use-holiday-auto').checked;

        localStorage.setItem('app_theme_v1.0', currentTheme);
        localStorage.setItem('global_work_config_v1.0', JSON.stringify(globalConfig));
        localStorage.setItem('holiday_work_config_v1.0', JSON.stringify(holidayConfig));
        
        document.documentElement.setAttribute('data-theme', currentTheme);
        
        const year = currentDate.getFullYear(); const monthIdx = currentDate.getMonth();
        const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
        const totalDays = new Date(year, monthIdx + 1, 0).getDate();

        for (let d = 1; d <= totalDays; d++) {
            const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
            const checkDate = new Date(year, monthIdx, d);
            const dayOfWeek = checkDate.getDay();
            const isHoli = isLegalHoliday(year, monthIdx, d);

            if (checkDate > todayMidnight) {
                let saved = attendanceData[dStr];
                if (!saved || !saved.isCustomModified) {
                    let currentType = getBaseWorkType(year, monthIdx, d, dayOfWeek, isHoli);
                    initDayContainer(dStr, currentType);
                    if (currentType === '평일') {
                        attendanceData[dStr].startTime = (dayOfWeek === 5) ? "06:00" : globalConfig.startTime;
                        attendanceData[dStr].endTime = (dayOfWeek === 5) ? "15:00" : globalConfig.endTime;
                    } else if (currentType === '휴일근무' && holidayConfig.useAuto && dayOfWeek !== 0) {
                        attendanceData[dStr].startTime = holidayConfig.startTime; attendanceData[dStr].endTime = holidayConfig.endTime;
                    }
                    let res = parseDailySheet(dStr, attendanceData[dStr].workType, attendanceData[dStr].startTime, attendanceData[dStr].endTime);
                    attendanceData[dStr].overtimeMins = res.overtimeMins; attendanceData[dStr].breakfast = res.breakfast; attendanceData[dStr].lunch = res.lunch; attendanceData[dStr].overtimeText = res.timeText;
                }
            }
        }
        localStorage.setItem('overtime_data_v1.0', JSON.stringify(attendanceData));
        globalConfigModal.classList.remove('open');
        showToast("설정이 성공적으로 반영되었습니다. 🎨");
        renderCalendar(); updateDashboard();
    });

    modalWorkTypeSelect.addEventListener('change', (e) => { applyTimeInputRules(e.target.value, selectedDateStr); updateModalLivePreview(); });
    [startTimeInput, endTimeInput].forEach(inp => inp.addEventListener('input', () => updateModalLivePreview()));

    document.getElementById('btn-clear').addEventListener('click', () => {
        if (attendanceData[selectedDateStr]) delete attendanceData[selectedDateStr];
        localStorage.setItem('overtime_data_v1.0', JSON.stringify(attendanceData));
        timeModal.classList.remove('open'); renderCalendar(); updateDashboard();
    });

    document.getElementById('time-form').addEventListener('submit', (e) => {
        e.preventDefault();
        let res = parseDailySheet(selectedDateStr, modalWorkTypeSelect.value, startTimeInput.value, endTimeInput.value);
        let prevSuk = attendanceData[selectedDateStr] ? attendanceData[selectedDateStr].isSukjik : false;
        let prevIl = attendanceData[selectedDateStr] ? attendanceData[selectedDateStr].isIljik : false;

        let pDate = new Date(selectedDateStr.split('-').map(Number)[0], selectedDateStr.split('-').map(Number)[1]-1, selectedDateStr.split('-').map(Number)[2]);
        let isModified = (pDate > todayMidnight);

        attendanceData[selectedDateStr] = {
            workType: modalWorkTypeSelect.value, 
            startTime: startTimeInput.value, 
            endTime: endTimeInput.value,
            customSchedule: modalCustomScheduleInput.value.trim(), 
            isSukjik: prevSuk, 
            isIljik: prevIl, 
            overtimeText: res.timeText, 
            overtimeMins: res.overtimeMins, 
            breakfast: res.breakfast, 
            lunch: res.lunch, 
            isCustomModified: isModified
        };
        localStorage.setItem('overtime_data_v1.0', JSON.stringify(attendanceData));
        timeModal.classList.remove('open'); renderCalendar(); updateDashboard();
    });

    document.getElementById('prev-month').addEventListener('click', () => moveMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => moveMonth(1));
}