const API_KEY = 'YOUR_GEMINI_KEY_HERE'; // Replace with your actual Gemini API key during local testing

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function calculateCost(inputTokens, outputTokens) {
  const INPUT_COST_PER_1K = 0.00025;
  const OUTPUT_COST_PER_1K = 0.0005;
  const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K;
  const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K;
  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost
  };
}

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function generateTextStreaming() {
  const prompt = document.getElementById('promptInput').value;
  const outputDiv = document.getElementById('output');
  const costDisplay = document.getElementById('costDisplay');
  if (!prompt.trim()) {
    alert('Please enter a prompt!');
    return;
  }
  const inputTokens = estimateTokens(prompt);
  outputDiv.textContent = '';
  costDisplay.textContent = 'Cost: calculating...';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${API_KEY}`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  };
  const startTime = Date.now();
  try {
    const response = await fetchWithRetry(url, options);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.candidates && data.candidates[0].content) {
              const text = data.candidates[0].content.parts[0].text;
              fullText += text;
              outputDiv.textContent += text;
            }
          } catch (e) {
            // skip malformed JSON
          }
        }
      }
    }
    const outputTokens = estimateTokens(fullText);
    const duration = Date.now() - startTime;
    const cost = calculateCost(inputTokens, outputTokens);
    costDisplay.textContent = `Cost: $${cost.total.toFixed(6)} (In: ${inputTokens} tokens, Out: ${outputTokens} tokens)`;
    console.log(`Duration: ${duration}ms`);
  } catch (error) {
    outputDiv.textContent = 'Error: ' + error.message;
    costDisplay.textContent = '';
  }
}

// Bind generateTextStreaming to global scope for button
window.generateTextStreaming = generateTextStreaming;