const analyzeBtn = document.getElementById('analyzeBtn');
const emailInput = document.getElementById('emailInput');
const floatingTooltip = document.getElementById('floatingTooltip');
let currentSuggestions = [];
let hoverTimeout;
let activeSpan = null;
let typingTimer;

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
    const text = emailInput.innerText;
    if (!text.trim()) return;
    
    if (mode === 'deep') {
        analyzeBtn.innerText = "Analyzing...";
        analyzeBtn.disabled = true;
    }

    try {
        const response = await fetch("http://localhost:5178/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ EmailText: text, Mode: mode })
        });

        const newSuggestions = await response.json();
        
        if (newSuggestions.length > 0) {
            let newHtml = text;
            currentSuggestions = []; // Reset highlight tracking
            
            newSuggestions.forEach(item => {
                const safePhrase = item.originalPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safePhrase})(?![^<]*>)`, 'gi');
                
                if (item.type === 'typo') {
                    // Silently auto-correct spelling and grammar
                    newHtml = newHtml.replace(regex, item.suggestedPhrase);
                } else {
                    // Save for hover tooltip and highlight
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
                hideTooltip();
            };
            
            document.getElementById('rejectBtn').onclick = () => {
                span.outerHTML = span.innerText; 
                hideTooltip();
            };
        });

        span.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(hideTooltip, 300);
        });
    });
    
    floatingTooltip.addEventListener('mouseenter', () => clearTimeout(hoverTimeout));
    floatingTooltip.addEventListener('mouseleave', hideTooltip);
}