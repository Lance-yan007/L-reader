const { ipcRenderer } = require('electron');

class StudyCardApp {
    constructor() {
        this.words = [];
        this.currentIndex = 0;
        this.isFlipped = false;
        this.mode = sessionStorage.getItem('studyMode') || 'review';
        this.sessionStart = Date.now();
        this.correctCount = 0;
        this.init();
    }

    async init() {
        await this.loadWords();
        if (this.words.length > 0) {
            this.showCard();
        } else {
            this.showCompletion();
        }
    }

    async loadWords() {
        try {
            let result;
            if (this.mode === 'review') {
                result = await ipcRenderer.invoke('get-vocabulary-for-review');
            } else if (this.mode === 'new') {
                result = await ipcRenderer.invoke('get-new-vocabulary');
            } else {
                result = await ipcRenderer.invoke('get-all-vocabulary');
                result = result?.data || [];
            }

            this.words = Array.isArray(result) ? result : (result?.data || []);

            // Shuffle words for better learning
            this.words = this.shuffleArray(this.words);
        } catch (error) {
            console.error('Failed to load words:', error);
            this.words = [];
        }
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    showCard() {
        if (this.currentIndex >= this.words.length) {
            this.showCompletion();
            return;
        }

        const word = this.words[this.currentIndex];
        this.isFlipped = false;

        // Update card content
        document.getElementById('word').textContent = word.word || '';
        document.getElementById('pronunciation').textContent = word.pronunciation || '';
        document.getElementById('contextFront').textContent = word.context || '';
        document.getElementById('translation').textContent = word.translation || '';
        document.getElementById('contextBack').textContent = word.context || '';

        // Update progress
        document.getElementById('currentIndex').textContent = this.currentIndex + 1;
        document.getElementById('totalCount').textContent = this.words.length;
        const progress = ((this.currentIndex + 1) / this.words.length) * 100;
        document.getElementById('progressFill').style.width = `${progress}%`;

        // Reset card flip
        document.getElementById('card').classList.remove('flipped');
        document.getElementById('ratingButtons').style.display = 'none';
        document.getElementById('flashcardContainer').style.display = 'flex';
    }

    async rateWord(proficiencyLevel) {
        const word = this.words[this.currentIndex];

        try {
            // Calculate next review time using SM-2 algorithm
            const nextReview = this.calculateNextReview(
                word.proficiency_level || 0,
                proficiencyLevel,
                word.ease_factor || 2.5,
                word.review_count || 0
            );

            // Update vocabulary progress
            await ipcRenderer.invoke('update-vocabulary-progress', {
                word: word.word,
                proficiency_level: proficiencyLevel,
                next_review: nextReview.nextReviewDate,
                ease_factor: nextReview.easeFactor,
                review_count: (word.review_count || 0) + 1
            });

            // Track accuracy
            if (proficiencyLevel >= 3) {
                this.correctCount++;
            }

            // Move to next card
            this.currentIndex++;
            this.showCard();
        } catch (error) {
            console.error('Failed to update word progress:', error);
            // Still move to next card even if update fails
            this.currentIndex++;
            this.showCard();
        }
    }

    /**
     * SM-2 Spaced Repetition Algorithm
     * @param {number} oldLevel - Previous proficiency level (0-5)
     * @param {number} newLevel - Current proficiency level (0-5)
     * @param {number} easeFactor - Current ease factor (default 2.5)
     * @param {number} reviewCount - Number of times reviewed
     * @returns {object} - {nextReviewDate, easeFactor}
     */
    calculateNextReview(oldLevel, newLevel, easeFactor, reviewCount) {
        // Update ease factor based on performance
        let newEaseFactor = easeFactor;

        if (newLevel >= 3) {
            // Good performance: increase ease factor slightly
            newEaseFactor = easeFactor + (0.1 - (5 - newLevel) * 0.08);
        } else {
            // Poor performance: decrease ease factor
            newEaseFactor = Math.max(1.3, easeFactor - 0.2);
        }

        // Clamp ease factor between 1.3 and 2.5
        newEaseFactor = Math.max(1.3, Math.min(2.5, newEaseFactor));

        // Calculate interval based on proficiency level
        let intervalDays;

        if (newLevel === 0) {
            // Don't know: review tomorrow
            intervalDays = 1;
        } else if (newLevel === 1) {
            // Vague: review in 2 days
            intervalDays = 2;
        } else if (newLevel === 2) {
            // Know but slow: review in 3 days
            intervalDays = 3;
        } else if (newLevel === 3) {
            // Know: use SM-2 intervals
            if (reviewCount === 0) {
                intervalDays = 1;
            } else if (reviewCount === 1) {
                intervalDays = 6;
            } else {
                intervalDays = Math.round(6 * Math.pow(newEaseFactor, reviewCount - 1));
            }
        } else if (newLevel === 4) {
            // Proficient: longer intervals
            intervalDays = Math.round(15 * Math.pow(newEaseFactor, reviewCount));
        } else {
            // Mastered (level 5): very long interval or no review
            intervalDays = 365; // Review once a year
        }

        // Calculate next review date
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

        return {
            nextReviewDate: nextReviewDate.toISOString(),
            easeFactor: newEaseFactor
        };
    }

    async showCompletion() {
        document.getElementById('flashcardContainer').style.display = 'none';
        document.getElementById('ratingButtons').style.display = 'none';

        const completionScreen = document.getElementById('completionScreen');
        completionScreen.classList.add('show');

        // Calculate session stats
        const sessionDuration = Math.round((Date.now() - this.sessionStart) / 1000);
        const accuracy = this.words.length > 0
            ? Math.round((this.correctCount / this.words.length) * 100)
            : 0;

        // Update completion stats
        document.getElementById('completionStats').innerHTML = `
            学习了 <strong>${this.words.length}</strong> 个单词<br>
            正确率 <strong>${accuracy}%</strong><br>
            用时 <strong>${Math.floor(sessionDuration / 60)}</strong> 分钟
        `;

        // Record study session
        try {
            await ipcRenderer.invoke('record-study-session', {
                words_studied: this.words.length,
                words_reviewed: this.mode === 'review' ? this.words.length : 0,
                accuracy_rate: accuracy / 100,
                study_duration: sessionDuration
            });
        } catch (error) {
            console.error('Failed to record study session:', error);
        }
    }
}

function flipCard() {
    const card = document.getElementById('card');
    const ratingButtons = document.getElementById('ratingButtons');

    if (!window.studyCardApp.isFlipped) {
        card.classList.add('flipped');
        ratingButtons.style.display = 'flex';
        window.studyCardApp.isFlipped = true;
    }
}

function rateWord(level) {
    window.studyCardApp.rateWord(level);
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.studyCardApp = new StudyCardApp();
});
