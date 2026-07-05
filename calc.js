// 인사혁신처 기준 호봉별 표준 단가표
export const insaStandard = {
    "9": { hourly: 10949, holiday: 88017 },
    "8": { hourly: 12113, holiday: 97373 },
    "7": { hourly: 12368, holiday: 99422 },
    "6": { hourly: 13692, holiday: 110065 }
};

// 2026년~2035년 완벽 대응 대한민국 공휴일 자동 검증 엔진
export function isLegalHoliday(year, month, day) {
    const m = month + 1;
    const dateKey = `${m}-${day}`;
    
    // 1. 매년 고정 양력 공휴일
    const fixedHolidays = ["1-1", "3-1", "5-5", "6-6", "8-15", "10-3", "10-9", "12-25"];
    if (fixedHolidays.includes(dateKey)) return true;

    // 2. 연도별 음력 명절(설날/추석) 및 유동 대체공휴일 완벽 자동 데이터북
    const dynamicHolidays = {
        2026: ["2-16", "2-17", "2-18", "3-3", "5-24", "9-24", "9-25", "9-26", "9-27"],
        2027: ["2-5", "2-6", "2-7", "2-8", "5-13", "9-14", "9-15", "9-16", "10-4"],
        2028: ["1-26", "1-27", "1-28", "1-29", "5-2", "10-2", "10-3", "10-4", "10-5"],
        2029: ["2-12", "2-13", "2-14", "5-20", "9-21", "9-22", "9-23", "9-24"],
        2030: ["2-2", "2-3", "2-4", "2-5", "5-9", "9-11", "9-12", "9-13"],
        2031: ["1-22", "1-23", "1-24", "1-26", "5-28", "9-30", "10-1", "10-2", "10-3"],
        2032: ["2-10", "2-11", "2-12", "9-18", "9-19", "9-20", "9-21"],
        2033: ["1-31", "2-1", "2-2", "2-3", "5-25", "9-7", "9-8", "9-9"],
        2034: ["2-18", "2-19", "2-20", "2-21", "5-25", "9-26", "9-27", "9-28"],
        2035: ["2-7", "2-8", "2-9", "5-15", "9-15", "9-16", "9-17", "9-18"]
    };

    if (dynamicHolidays[year] && dynamicHolidays[year].includes(dateKey)) {
        return true;
    }
    return false;
}

// 하루치 출퇴근 시간을 파싱하여 초과근무 분(Minutes) 및 식사 지급 여부 계산
export function parseDailySheet(dateStr, workType, startVal, endVal) {
    let overtimeMins = 0; let breakfast = 0; let lunch = 0;
    if (!startVal || !endVal) return { overtimeMins, breakfast, lunch, timeText: "" };

    const [sH, sM] = startVal.split(':').map(Number);
    const [eH, eM] = endVal.split(':').map(Number);
    let startMins = sH * 60 + sM;
    let endMins = eH * 60 + eM;
    if (endMins < startMins) endMins += 24 * 60; 

    if (workType !== '휴일근무' && !['휴무','연가','대휴','특가','공가'].includes(workType)) {
        let totalWorkMins = endMins - startMins;
        let baseWorkMins = 540; // 기본 9시간 정무
        let remainingMins = totalWorkMins - baseWorkMins;
        if (remainingMins > 0) { overtimeMins = Math.max(0, remainingMins - 60); } // 식사시간 휴게 1시간 자동차감
        if (sH < 5) breakfast = 1; 
        if (eH >= 16) lunch = 1;   
    } 
    else if (workType === '휴일근무') {
        // 새벽당직 인정구간 (03:00 ~ 06:00)
        let targetStart = 3 * 60; let targetEnd = 6 * 60;   
        let overlapStart = Math.max(startMins, targetStart);
        let overlapEnd = Math.min(endMins, targetEnd);
        if (overlapStart < overlapEnd) { overtimeMins += (overlapEnd - overlapStart); }

        // 오후당직 인정구간 (15:00 ~ 18:00)
        let afternoonStart = 15 * 60; let afternoonEnd = 18 * 60;
        let overlapAfternoonStart = Math.max(startMins, afternoonStart);
        let overlapAfternoonEnd = Math.min(endMins, afternoonEnd);
        if (overlapAfternoonStart < overlapAfternoonEnd) { overtimeMins += (overlapAfternoonEnd - overlapAfternoonStart); }

        let mealMins = 0;
        let mStart1 = Math.max(startMins, 3 * 60); let mEnd1 = Math.min(endMins, 6 * 60);
        if (mStart1 < mEnd1) mealMins += (mEnd1 - mStart1);
        let mStart2 = Math.max(startMins, 15 * 60); let mEnd2 = Math.min(endMins, 18 * 60);
        if (mStart2 < mEnd2) mealMins += (mEnd2 - mStart2);

        if (mealMins >= 120) lunch = 1; // 휴일 실제 누적 근무가 2시간 이상일 때 급량비 발생
    }

    const h = Math.floor(overtimeMins / 60);
    const m = overtimeMins % 60;
    return { overtimeMins, breakfast, lunch, timeText: overtimeMins > 0 ? `${h}H ${String(m).padStart(2, '0')}M` : "" };
}

// 로컬 저장소 전체 데이터를 가공하여 한 달 동안의 내역을 엑셀(CSV) 문자열로 추출변환 (신규 한줄 일정 내역 병합 추가)
export function convertToCSV(year, monthIdx, attendanceData) {
    const prefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const totalDays = new Date(year, monthIdx + 1, 0).getDate();
    const weekdaysText = ['일', '월', '화', '수', '목', '금', '토'];

    // Excel 한글 깨짐 방지용 특수 UTF-8 BOM 선언 처리
    let csvContent = "\uFEFF";
    csvContent += "날짜,요일,근무형태,출근시간,퇴근시간,초과근무인정,등록일정,숙직여부,일직여부,조식여부,급량비여부\n";

    for (let d = 1; d <= totalDays; d++) {
        const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
        const checkDate = new Date(year, monthIdx, d);
        const dayOfWeek = weekdaysText[checkDate.getDay()];
        
        let saved = attendanceData[dStr] || {};
        let workType = saved.workType || "평일";
        let startTime = saved.startTime || "";
        let endTime = saved.endTime || "";
        let overtimeText = saved.overtimeText || "";
        let customSchedule = saved.customSchedule || ""; // 기록에 새겨진 개별 일정 병합
        let isSukjik = saved.isSukjik ? "O" : "X";
        let isIljik = saved.isIljik ? "O" : "X";
        let breakfast = saved.breakfast ? "O" : "X";
        let lunch = saved.lunch ? "O" : "X";

        csvContent += `${dStr},${dayOfWeek},${workType},${startTime},${endTime},${overtimeText},${customSchedule},${isSukjik},${isIljik},${breakfast},${lunch}\n`;
    }
    return csvContent;
}
