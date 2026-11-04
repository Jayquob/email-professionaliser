const analyzeBtn = document.getElementById('analyzeBtn');
const emailInput = document.getElementById('emailInput');
const floatingTooltip = document.getElementById('floatingTooltip');
let currentSuggestions = [];
let hoverTimeout;
let activeSpan = null;
let typingTimer;
let conversationMemory = [];

// Auto-check for obvious errors 1.5 seconds after the user stops typing
emailInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        runAnalysis('surface');
    }, 1500);
});

// Deep tone check triggered manually by the button
analyzeBtn.addEventListener('click', () => {
    runAnalysis('deep');
});

async function runAnalysis(mode) {
    // 1. Grab pure text for the AI to read
    const textForAi = emailInput.innerText; 
    
    // 2. Grab the actual HTML (with line breaks) to preserve your formatting
    const currentHtml = emailInput.innerHTML; 
    
    if (!textForAi.trim()) return;
    
    if (mode === 'deep') {
        analyzeBtn.innerText = "Analyzing...";
        analyzeBtn.disabled = true;
    }

    try {
        const response = await fetch("http://localhost:5178/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                EmailText: textForAi, // Send the clean text to Groq
                Mode: mode,
                History: conversationMemory 
            })
        });

        const newSuggestions = await response.json();
        
        conversationMemory.push({ Role: "user", Content: textForAi });
        conversationMemory.push({ Role: "assistant", Content: JSON.stringify(newSuggestions) });
        
        if (newSuggestions.length > 0) {
            let newHtml = currentHtml; // Start with your preserved layout!
            currentSuggestions = []; 
            
            newSuggestions.forEach(item => {
                const safePhrase = item.originalPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // The regex still safely ignores the <br> tags thanks to (?![^<]*>)
                const regex = new RegExp(`(${safePhrase})(?![^<]*>)`, 'gi');
                
                if (item.type === 'typo') {
                    newHtml = newHtml.replace(regex, item.suggestedPhrase);
                } else {
                    const highlightIndex = currentSuggestions.length;
                    currentSuggestions.push(item);
                    newHtml = newHtml.replace(regex, `<span class="highlight" data-id="${highlightIndex}">$1</span>`);
                }
            });
            
            emailInput.innerHTML = newHtml;
            setupHoverEffects();
        }

    } catch (error) {
        console.error("Connection failed.");
    } finally {
        if (mode === 'deep') {
            analyzeBtn.innerText = "Analyze Tone";
            analyzeBtn.disabled = false;
        }
    }
}

function hideTooltip() {
    floatingTooltip.classList.add('hidden');
    if (activeSpan) {
        activeSpan.classList.remove('active-strikethrough');
        activeSpan = null;
    }
}

function setupHoverEffects() {
    const highlights = document.querySelectorAll('.highlight');
    
    highlights.forEach(span => {
        span.addEventListener('mouseenter', (e) => {
            clearTimeout(hoverTimeout);
            
            if (activeSpan && activeSpan !== span) {
                activeSpan.classList.remove('active-strikethrough');
            }
            
            activeSpan = span;
            span.classList.add('active-strikethrough');

            const id = span.getAttribute('data-id');
            const item = currentSuggestions[id];
            
            floatingTooltip.innerHTML = `
                <p><strong>Suggestion:</strong> ${item.suggestedPhrase}</p>
                <p style="font-size:13px; color:#666;"><em>${item.reason}</em></p>
                <div class="actions" style="margin-top:10px;">
                    <button id="acceptBtn" class="accept-btn">Accept</button>
                    <button id="rejectBtn" class="reject-btn">Reject</button>
                </div>
            `;
            
            const rect = span.getBoundingClientRect();
            floatingTooltip.style.top = (rect.bottom + window.scrollY + 8) + 'px';
            floatingTooltip.style.left = (rect.left + window.scrollX) + 'px';
            floatingTooltip.classList.remove('hidden');

            document.getElementById('acceptBtn').onclick = () => {
                span.outerHTML = item.suggestedPhrase; 
                
                conversationMemory.push({ 
                    Role: "user", 
                    Content: `I accepted your suggestion to replace '${item.originalPhrase}' with '${item.suggestedPhrase}'.` 
                });
                
                hideTooltip();
            };
            
            document.getElementById('rejectBtn').onclick = () => {
                span.outerHTML = span.innerText; 
                
                conversationMemory.push({ 
                    Role: "user", 
                    Content: `I intentionally rejected your suggestion to change '${item.originalPhrase}'. Do not flag '${item.originalPhrase}' as an error again.` 
                });
                
                hideTooltip();
            };
        });

        // Increased from 300 to 600 milliseconds
        span.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(hideTooltip, 600);
        });
    });
}

// MOVED OUTSIDE THE FUNCTION: These now only run once when the page loads
floatingTooltip.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));
floatingTooltip.addEventListener('mouseleave', () => {
    // Add the same delay when leaving the tooltip itself
    hoverTimeout = setTimeout(hideTooltip, 600);
});