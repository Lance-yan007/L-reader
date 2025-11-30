/**
 * Study Dashboard - Web Version
 * Uses StorageAdapter instead of Electron IPC
 */

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
            if (!window.StorageAdapter) {
                console.error('StorageAdapter not found');
                return;
            }

            // Get all vocabulary
            const response = await window.StorageAdapter.getAllVocabulary();
            const allWords = response.data || [];

            // Total vocabulary count
            this.stats.browseCount = allWords.length;
            this.stats.totalStudied = allWords.length;

            // Count words that need review (for now, all words)
            // In future, implement SM-2 algorithm to determine review schedule
            this.stats.reviewCount = allWords.length;
            this.stats.todayReview = allWords.length;

            // New words (words added recently, e.g., last 7 days)
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            this.stats.newCount = allWords.filter(w => {
                const createdAt = w.createdAt || 0;
                return createdAt > sevenDaysAgo;
            }).length;

            // Get study sessions for streak calculation
            const sessions = await window.StorageAdapter.getStudySessions(90);
            this.stats.streak = this.calculateStreak(sessions);
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

    updateUI() {
        const todayReviewEl = document.getElementById('todayReviewCount');
        const streakEl = document.getElementById('streakDays');
        const totalStudiedEl = document.getElementById('totalStudied');
        const reviewModeEl = document.getElementById('reviewModeCount');
        const newModeEl = document.getElementById('newModeCount');
        const browseModeEl = document.getElementById('browseModeCount');

        if (todayReviewEl) todayReviewEl.textContent = this.stats.todayReview;
        if (streakEl) streakEl.textContent = this.stats.streak;
        if (totalStudiedEl) totalStudiedEl.textContent = this.stats.totalStudied;
        if (reviewModeEl) reviewModeEl.textContent = this.stats.reviewCount;
        if (newModeEl) newModeEl.textContent = this.stats.newCount;
        if (browseModeEl) browseModeEl.textContent = this.stats.browseCount;
    }

    async renderHeatmap() {
        try {
            const sessions = await window.StorageAdapter.getStudySessions(90);
            const heatmapData = this.generateHeatmapData(sessions);

            const grid = document.getElementById('heatmapGrid');
            if (!grid) return;

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

    // Navigate to study card
    if (window.webApp) {
        window.webApp.navigate('study-card');
    } else {
        window.location.hash = '#/study-card';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.studyApp = new StudyApp();
});
