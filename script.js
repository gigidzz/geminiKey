
const API_KEY = 'yourapikey'; // Replace with your actual API key
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:streamGenerateContent';

const PRICING = {
    inputCostPer1M: 0.075,  // $0.075 per 1M input tokens
    outputCostPer1M: 0.30   // $0.30 per 1M output tokens
};

const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generateBtn');
const outputSection = document.getElementById('outputSection');
const output = document.getElementById('output');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const costDisplay = document.getElementById('costDisplay');
const costValue = document.getElementById('costValue');
const copyBtn = document.getElementById('copyBtn');
const footerText = document.getElementById('footerText');

let isGenerating = false;
let totalInputTokens = 0;
let totalOutputTokens = 0;

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

// Calculate cost
function calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000000) * PRICING.inputCostPer1M;
    const outputCost = (outputTokens / 1000000) * PRICING.outputCostPer1M;
    return inputCost + outputCost;
}

// Update cost display
function updateCostDisplay() {
    const cost = calculateCost(totalInputTokens, totalOutputTokens);
    costValue.textContent = `$${cost.toFixed(6)}`;
    costDisplay.style.display = 'flex';
}

// Exponential backoff retry logic
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            // Don't retry on client errors (4xx)
            if (error.status && error.status >= 400 && error.status < 500) {
                throw error;
            }
            
            // Calculate exponential backoff delay
            const delay = baseDelay * Math.pow(2, attempt);
            const jitter = Math.random() * 1000; // Add random jitter
            const totalDelay = delay + jitter;
            
            console.log(`Attempt ${attempt + 1} failed. Retrying in ${Math.round(totalDelay)}ms...`);
            
            // Wait before retrying (except on last attempt)
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, totalDelay));
            }
        }
    }
    
    throw lastError;
}

// Show/hide UI elements
function showLoading() {
    loadingIndicator.style.display = 'flex';
    errorMessage.style.display = 'none';
    outputSection.style.display = 'none';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
}

function showOutput() {
    outputSection.style.display = 'block';
    hideLoading();
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    hideLoading();
}

function setGenerating(generating) {
    isGenerating = generating;
    generateBtn.disabled = generating;
    promptInput.disabled = generating;
    generateBtn.textContent = generating ? 'Generating...' : 'Generate';
}

// Stream response from Gemini API
async function streamGenerateText(prompt) {
    const requestFn = async () => {
        const response = await fetch(`${API_ENDPOINT}?key=${API_KEY}&alt=sse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.9,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 2048,
                }
            })
        });

        if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return response;
    };

    // Use retry logic with exponential backoff
    const response = await retryWithBackoff(requestFn);
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    // Estimate input tokens
    totalInputTokens = estimateTokens(prompt);
    totalOutputTokens = 0;
    updateCostDisplay();

    showOutput();
    output.textContent = '';
    if (copyBtn) {
        copyBtn.disabled = true;
        copyBtn.textContent = 'Copy';
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    
                    try {
                        const data = JSON.parse(jsonStr);
                        
                        if (data.candidates && data.candidates[0]?.content?.parts) {
                            const text = data.candidates[0].content.parts[0]?.text || '';
                            
                            if (text) {
                                accumulatedText += text;
                                output.textContent = accumulatedText;
                                
                                // Update output token estimate
                                totalOutputTokens = estimateTokens(accumulatedText);
                                updateCostDisplay();
                                if (copyBtn) {
                                    copyBtn.disabled = false;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore JSON parse errors for incomplete chunks
                        if (!jsonStr.includes('[DONE]')) {
                            console.warn('Failed to parse chunk:', jsonStr);
                        }
                    }
                }
            }
        }

        if (!accumulatedText) {
            throw new Error('No response generated');
        }

    } catch (error) {
        console.error('Streaming error:', error);
        throw error;
    }
}

// Handle generate button click
async function handleGenerate() {
    const prompt = promptInput.value.trim();

    if (!prompt) {
        showError('Please enter a prompt before generating.');
        return;
    }

    if (!API_KEY || API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        showError('Please add your Gemini API key in script.js');
        return;
    }

    setGenerating(true);
    showLoading();

    try {
        await streamGenerateText(prompt);
    } catch (error) {
        console.error('Error generating text:', error);
        
        let errorMsg = 'Failed to generate response. ';
        
        if (error.status === 429) {
            errorMsg += 'Rate limit exceeded. Please try again later.';
        } else if (error.status === 401) {
            errorMsg += 'Invalid API key.';
        } else if (error.status === 403) {
            errorMsg += 'API key does not have permission.';
        } else {
            errorMsg += error.message || 'Unknown error occurred.';
        }
        
        showError(errorMsg);
    } finally {
        setGenerating(false);
    }
}

// Event listeners
generateBtn.addEventListener('click', handleGenerate);

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        handleGenerate();
    }
});

if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
        const textToCopy = output.textContent || '';
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            const original = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.disabled = true;
            setTimeout(() => {
                copyBtn.textContent = original || 'Copy';
                copyBtn.disabled = false;
            }, 2000);
        } catch (err) {
            console.error('Copy failed', err);
            // Fallback: select and prompt
            try {
                const range = document.createRange();
                range.selectNodeContents(output);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                sel.removeAllRanges();
                const original = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.textContent = original || 'Copy', 2000);
            } catch (e) {
                showError('Copy not supported in this browser.');
            }
        }
    });
}

// Footer: display KIU email and current date
if (footerText) {
    const now = new Date();
    const year = now.getFullYear();
    const formatted = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    footerText.textContent = `© ${year} dzimistarishvili.gio@kiu.edu.ge - ${formatted}`;
}

// Show instructions on load
console.log('%c⚠️ SETUP INSTRUCTIONS', 'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('1. Get your Gemini API key from: https://aistudio.google.com/app/apikey');
console.log('2. Open script.js and replace YOUR_GEMINI_API_KEY_HERE with your actual API key');
console.log('3. Refresh the page and start generating!');