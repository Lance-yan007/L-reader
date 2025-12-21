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

        // Gemini API Configuration
        this.geminiApiKey = 'AIzaSyCqcvZmcr1-BbAthoDVIvotcjM2gANMklY';
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent';

        this.ui = {
            cardArea: document.getElementById('cardArea'),
            summaryCard: document.getElementById('summaryCard'),
            sentenceDisplay: document.getElementById('sentenceDisplay'),

            revealTrigger: document.getElementById('revealTrigger'),
            revealSection: document.getElementById('revealSection'),
            phonetic: document.getElementById('phonetic'),
            definition: document.getElementById('definition'),

            progressBar: document.getElementById('progressBar'),
            summaryCount: document.getElementById('summaryCount'),
            summaryCount: document.getElementById('summaryCount'),
            summaryAccuracy: document.getElementById('summaryAccuracy'),
            closeBtn: document.querySelector('.close-btn')
        };

        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadWords();
        this.bindEvents();
        this.showNextCard();
    }

    async loadSettings() {
        if (window.StorageAdapter) {
            this.settings = await window.StorageAdapter.getUserSettings();
            this.dailyProgress = await window.StorageAdapter.getDailyProgress();
        }
    }

    async loadWords() {
        if (!window.StorageAdapter) {
            console.error('StorageAdapter not found');
            return;
        }

        try {
            // Get review pack from main app
            const mainApp = window.mainAppInstance;
            if (mainApp && mainApp.reviewPack) {
                // Use the pre-generated review pack
                const pack = mainApp.reviewPack;
                this.queue = [...pack.dueWords, ...pack.newWords];

                console.log(`Loaded ${this.queue.length} words from review pack`);
            } else {
                // Fallback: generate pack here if main app not available
                const response = await window.StorageAdapter.getAllVocabulary();
                const allWords = response.data || [];
                const now = Date.now();

                const dueWords = allWords.filter(w => w.nextReview && w.nextReview <= now);
                const newWords = allWords.filter(w => !w.repetitions || w.repetitions === 0);

                this.queue = [...dueWords.slice(0, 30), ...newWords.slice(0, 20)];
                console.log(`Loaded ${this.queue.length} words using fallback logic`);
            }

            // Seed sample data if absolutely no words (for demo/testing)
            if (this.queue.length === 0) {
                const sampleWords = [
                    { word: 'ephemeral', translation: '短暂的', phonetic: 'əˈfem(ə)rəl' },
                    { word: 'serendipity', translation: '意外发现珍奇事物的本领', phonetic: 'ˌserənˈdipədē' },
                    { word: 'ubiquitous', translation: '无处不在的', phonetic: 'yo͞oˈbikwədəs' }
                ];
                this.queue = sampleWords;
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

        // Always show the word prominently
        let html = `<div class="word-main">${word.word}</div>`;

        // Check if context needs to be generated (missing or looks like "Context for...")
        const needsGeneration = !word.context ||
            word.context.includes('Context for') ||
            word.context.trim() === '';

        if (needsGeneration) {
            // No context or invalid context, generate it with AI
            html += `<div class="word-context placeholder" id="contextPlaceholder">正在生成例句...</div>`;
            this.generateContext(word);
        } else {
            // Has valid context, display it
            const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
            const contextSentence = word.context.replace(regex, `<span class="word-highlight">${word.word}</span>`);
            html += `<div class="word-context">${contextSentence}</div>`;
        }

        this.ui.sentenceDisplay.innerHTML = html;

        // Pre-fill hidden details
        this.ui.phonetic.textContent = word.phonetic ? `/${word.phonetic}/` : '';
        this.ui.definition.textContent = word.translation || '暂无释义';
    }

    async generateContext(wordObj) {
        if (wordObj.isGeneratingContext) return;
        wordObj.isGeneratingContext = true;

        try {
            console.log(`Generating context for: ${wordObj.word}`);
            const prompt = `Please generate a short, simple English example sentence for the word "${wordObj.word}". The sentence should be easy to understand. Only return the sentence, nothing else.`;

            const response = await fetch(`${this.geminiApiUrl}?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            const data = await response.json();

            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const sentence = data.candidates[0].content.parts[0].text.trim();
                console.log(`Generated context: ${sentence}`);

                // Update word object
                wordObj.context = sentence;

                // Update UI if still on the same word
                if (this.currentWord === wordObj) {
                    const regex = new RegExp(`\\b${wordObj.word}\\b`, 'gi');
                    const contextSentence = sentence.replace(regex, `<span class="word-highlight">${wordObj.word}</span>`);

                    const placeholder = document.getElementById('contextPlaceholder');
                    if (placeholder) {
                        placeholder.innerHTML = contextSentence;
                        placeholder.classList.remove('placeholder');
                    }
                }

                // Save to storage (optional, but good for caching)
                // window.StorageAdapter.updateVocabulary(wordObj); 
            }
        } catch (error) {
            console.error('Failed to generate context:', error);
            const placeholder = document.getElementById('contextPlaceholder');
            if (placeholder && this.currentWord === wordObj) {
                placeholder.textContent = '例句生成失败';
            }
        } finally {
            wordObj.isGeneratingContext = false;
        }
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

    calculateSM2(word, quality) {
        // Default values
        let interval = word.interval || 0;
        let repetitions = word.repetitions || 0;
        let easeFactor = word.easeFactor || 2.5;

        if (quality < 3) {
            // Forgot (1) or Hard (2) - Reset or Shorten
            repetitions = 0;
            interval = 1;
        } else {
            // Good (3)
            if (repetitions === 0) {
                interval = 1;
            } else if (repetitions === 1) {
                interval = 6;
            } else {
                interval = Math.round(interval * easeFactor);
            }
            repetitions++;
        }

        // Update Ease Factor (Standard SM-2 Formula)
        // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        // q is quality (0-5), but we map our 1-3 buttons to 0-5 scale internally if needed
        // Here we simplify:
        // Hard (2) -> decrease EF slightly
        // Good (3) -> keep or increase slightly

        if (quality === 2) {
            easeFactor = Math.max(1.3, easeFactor - 0.15);
        } else if (quality === 3) {
            easeFactor = easeFactor + 0.1;
        }

        return {
            interval,
            repetitions,
            easeFactor,
            nextReview: Date.now() + (interval * 24 * 60 * 60 * 1000)
        };
    }

    async rate(quality) {
        if (!this.currentWord) return;

        // Update stats
        this.results.reviewed++;
        if (quality >= 3) this.results.correct++;

        // Calculate new SM-2 values
        const sm2Result = this.calculateSM2(this.currentWord, quality);

        // Update word object
        const updatedWord = {
            ...this.currentWord,
            ...sm2Result,
            lastReviewed: Date.now()
        };

        // Save to DB
        if (window.StorageAdapter) {
            await window.StorageAdapter.updateVocabulary(updatedWord);
            await window.StorageAdapter.updateDailyProgress(1);

            // Update local tracking
            if (this.dailyProgress) {
                this.dailyProgress.count++;
            }
        }

        console.log(`Rated '${this.currentWord.word}' Q:${quality} -> Int:${sm2Result.interval}d`);

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

        // Mark daily review as completed
        if (window.StorageAdapter) {
            const today = new Date().toISOString().split('T')[0];
            const completedProgress = {
                date: today,
                count: this.results.reviewed,
                completed: true
            };
            localStorage.setItem('daily_study_progress', JSON.stringify(completedProgress));

            console.log('Daily review marked as completed');
        }

        // Update title to show completion
        const title = this.ui.summaryCard.querySelector('.summary-title');
        if (title) {
            title.innerHTML = '🎉 今日复习完成!';
            title.style.color = '#4CAF50';
        }
    }
}

// Initialize Session
window.studySession = new StudySession();
