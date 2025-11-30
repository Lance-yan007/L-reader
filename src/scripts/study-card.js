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
        this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent';

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
            const response = await window.StorageAdapter.getAllVocabulary();
            const allWords = response.data || [];

            // Take all words, shuffle, and limit to 10
            this.queue = allWords
                .sort(() => Math.random() - 0.5) // Shuffle
                .slice(0, 10); // Session limit

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
