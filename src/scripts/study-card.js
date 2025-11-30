/**
 * Focus Mode Study Card Logic
 * Implements Context-First Learning & SM-2 Algorithm
 */

class StudySession {
    constructor() {
        this.queue = [];
        this.currentIndex = 0;
        this.currentWord = null;
        this.isRevealed = false;
        this.results = {
            reviewed: 0,
            correct: 0 // Count of 'Good' or 'Easy'
        };

        this.ui = {
            cardArea: document.getElementById('cardArea'),
            summaryCard: document.getElementById('summaryCard'),
            sentenceDisplay: document.getElementById('sentenceDisplay'),
            bookSource: document.getElementById('bookSource'),
            sourceText: document.getElementById('sourceText'),
            revealTrigger: document.getElementById('revealTrigger'),
            revealSection: document.getElementById('revealSection'),
            phonetic: document.getElementById('phonetic'),
            definition: document.getElementById('definition'),
            mnemonic: document.getElementById('mnemonic'),
            progressBar: document.getElementById('progressBar'),
            summaryCount: document.getElementById('summaryCount'),
            summaryCount: document.getElementById('summaryCount'),
            summaryAccuracy: document.getElementById('summaryAccuracy'),
            closeBtn: document.querySelector('.close-btn')
        };

        this.init();
    }

    async init() {
        await this.loadWords();
        this.bindEvents();
        this.showNextCard();
    }

    async loadWords() {
        if (!window.StorageAdapter) {
            console.error('StorageAdapter not found');
            return;
        }

        try {
            // Fetch words due for review or new words
            // For MVP, we fetch all and filter/sort. In production, use a dedicated query.
            const allWords = await window.StorageAdapter.getVocabularyList();

            // Simple logic: Prioritize words with context
            // In real SM-2, we'd check nextReview date
            this.queue = allWords
                .filter(w => w.context) // Must have context for this mode
                .sort(() => Math.random() - 0.5) // Shuffle for now
                .slice(0, 10); // Session limit

            // If no words with context, fallback to words without context (show word directly)
            if (this.queue.length === 0 && allWords.length > 0) {
                this.queue = allWords.slice(0, 10);
            }

            console.log(`Loaded ${this.queue.length} words for session`);
        } catch (error) {
            console.error('Failed to load words:', error);
            this.ui.sentenceDisplay.textContent = '加载失败，请重试';
        }
    }

    bindEvents() {
        // Click to reveal
        document.body.addEventListener('click', (e) => {
            // Ignore clicks on buttons
            if (e.target.closest('button')) return;
            if (!this.isRevealed && this.queue.length > 0) {
                this.reveal();
            }
        });

        // Close button
        if (this.ui.closeBtn) {
            this.ui.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent body click
                if (window.webApp) {
                    window.webApp.navigate('main');
                } else {
                    window.location.hash = '#/main';
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.queue.length === 0) return;

            if (e.code === 'Space') {
                if (!this.isRevealed) {
                    this.reveal();
                }
            } else if (this.isRevealed) {
                if (e.key === '1') this.rate(1);
                if (e.key === '2') this.rate(2);
                if (e.key === '3') this.rate(3);
                if (e.key === '4') this.rate(4);
            }
        });

        // Expose rate function globally for HTML buttons
        window.rateWord = (quality) => this.rate(quality);
    }

    showNextCard() {
        if (this.currentIndex >= this.queue.length) {
            this.finishSession();
            return;
        }

        this.currentWord = this.queue[this.currentIndex];
        this.isRevealed = false;

        // Reset UI
        this.ui.revealSection.classList.remove('visible');
        this.ui.revealTrigger.style.display = 'block';
        this.ui.revealTrigger.style.opacity = '1';

        // Update Progress
        const progress = (this.currentIndex / this.queue.length) * 100;
        this.ui.progressBar.style.width = `${progress}%`;

        // Render Context
        this.renderFront();
    }

    renderFront() {
        const word = this.currentWord;

        if (word.context) {
            // Create Cloze Deletion
            // Case insensitive replacement
            const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
            const clozeSentence = word.context.replace(regex, `<span class="cloze-blank">_______</span>`);
            this.ui.sentenceDisplay.innerHTML = clozeSentence;
        } else {
            // Fallback if no context
            this.ui.sentenceDisplay.innerHTML = `<span class="cloze-blank">_______</span>`;
        }

        this.ui.sourceText.textContent = word.source || '未知来源';

        // Pre-fill hidden details
        this.ui.phonetic.textContent = word.phonetic ? `/${word.phonetic}/` : '';
        this.ui.definition.textContent = word.translation || '暂无释义';

        // Mock Mnemonic
        const mnemonics = [
            "联想：词根拆解记忆法",
            "场景：想象在图书馆阅读这本书",
            "对比：与同义词区分记忆"
        ];
        this.ui.mnemonic.textContent = `💡 ${mnemonics[Math.floor(Math.random() * mnemonics.length)]}`;
    }

    reveal() {
        this.isRevealed = true;
        this.ui.revealSection.classList.add('visible');
        this.ui.revealTrigger.style.display = 'none';

        // Fill in the blank
        const blanks = document.querySelectorAll('.cloze-blank');
        blanks.forEach(blank => {
            blank.textContent = this.currentWord.word;
            blank.classList.add('revealed');
        });
    }

    async rate(quality) {
        if (!this.currentWord) return;

        // Update stats
        this.results.reviewed++;
        if (quality >= 3) this.results.correct++;

        // SM-2 Algorithm Implementation (Simplified)
        // In a real app, we would calculate new interval, repetitions, and ease factor
        // and save to DB.

        /* 
        const easeFactor = this.currentWord.easeFactor || 2.5;
        const interval = this.currentWord.interval || 0;
        const repetitions = this.currentWord.repetitions || 0;
        // ... calculate new values ...
        */

        // For now, just log and move on
        console.log(`Rated word '${this.currentWord.word}' with quality ${quality}`);

        // Animate card out? Optional.

        this.currentIndex++;
        this.showNextCard();
    }

    finishSession() {
        this.ui.cardArea.style.display = 'none';
        this.ui.summaryCard.style.display = 'block';
        this.ui.progressBar.style.width = '100%';

        this.ui.summaryCount.textContent = this.results.reviewed;

        const accuracy = this.results.reviewed > 0
            ? Math.round((this.results.correct / this.results.reviewed) * 100)
            : 0;
        this.ui.summaryAccuracy.textContent = `${accuracy}%`;
    }
}

// Initialize Session
window.studySession = new StudySession();
