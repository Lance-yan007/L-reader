const { ipcRenderer } = require('electron');

class StudyApp {
    constructor() {
        this.stats = {
            todayReview: 0,
            streak: 0,
            totalStudied: 0,
            reviewCount: 0,
            newCount: 0,
            browseCount: 0
        };
        this.init();
    }

    async init() {
        await this.loadStats();
        this.renderHeatmap();
        this.updateUI();
    }

    async loadStats() {
        try {
            // Get words due for review today
            const reviewWords = await ipcRenderer.invoke('get-vocabulary-for-review');
            this.stats.reviewCount = reviewWords?.length || 0;
            this.stats.todayReview = this.stats.reviewCount;

            // Get new words (not yet studied)
            const newWords = await ipcRenderer.invoke('get-new-vocabulary');
            this.stats.newCount = newWords?.length || 0;

            // Get all vocabulary for browse mode
            const allWords = await ipcRenderer.invoke('get-all-vocabulary');
            this.stats.browseCount = allWords?.data?.length || 0;

            // Get study sessions for streak calculation
            const sessions = await ipcRenderer.invoke('get-study-sessions', 90);
            this.stats.streak = this.calculateStreak(sessions);
            this.stats.totalStudied = this.calculateTotalStudied(sessions);
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    calculateStreak(sessions) {
        if (!sessions || sessions.length === 0) return 0;

        // Sort sessions by date descending
        const sortedSessions = sessions.sort((a, b) =>
            new Date(b.study_date) - new Date(a.study_date)
        );

        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < sortedSessions.length; i++) {
            const sessionDate = new Date(sortedSessions[i].study_date);
            sessionDate.setHours(0, 0, 0, 0);

            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);

            if (sessionDate.getTime() === expectedDate.getTime()) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    calculateTotalStudied(sessions) {
        if (!sessions || sessions.length === 0) return 0;
        return sessions.reduce((total, session) =>
            total + (session.words_studied || 0), 0
        );
    }

    updateUI() {
        document.getElementById('todayReviewCount').textContent = this.stats.todayReview;
        document.getElementById('streakDays').textContent = this.stats.streak;
        document.getElementById('totalStudied').textContent = this.stats.totalStudied;
        document.getElementById('reviewModeCount').textContent = this.stats.reviewCount;
        document.getElementById('newModeCount').textContent = this.stats.newCount;
        document.getElementById('browseModeCount').textContent = this.stats.browseCount;
    }

    async renderHeatmap() {
        try {
            const sessions = await ipcRenderer.invoke('get-study-sessions', 90);
            const heatmapData = this.generateHeatmapData(sessions);

            const grid = document.getElementById('heatmapGrid');
            grid.innerHTML = '';

            heatmapData.forEach(day => {
                const cell = document.createElement('div');
                cell.className = 'heatmap-cell';
                cell.setAttribute('data-level', day.level);
                cell.setAttribute('data-tooltip', `${day.date}: ${day.count} 个单词`);
                grid.appendChild(cell);
            });
        } catch (error) {
            console.error('Failed to render heatmap:', error);
        }
    }

    generateHeatmapData(sessions) {
        const data = [];
        const today = new Date();
        const sessionMap = new Map();

        // Create a map of sessions by date
        if (sessions) {
            sessions.forEach(session => {
                const date = new Date(session.study_date);
                const dateStr = date.toISOString().split('T')[0];
                sessionMap.set(dateStr, session.words_studied || 0);
            });
        }

        // Generate data for last 90 days (approximately 13 weeks)
        for (let i = 89; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const count = sessionMap.get(dateStr) || 0;

            let level = 0;
            if (count > 0) {
                if (count >= 30) level = 4;
                else if (count >= 20) level = 3;
                else if (count >= 10) level = 2;
                else level = 1;
            }

            data.push({
                date: dateStr,
                count: count,
                level: level
            });
        }

        return data;
    }
}

function startStudyMode(mode) {
    // Store mode in sessionStorage for the card page to read
    sessionStorage.setItem('studyMode', mode);
    window.location.hash = '#/study-card';
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.studyApp = new StudyApp();
});
