// Matrix Background Effect
function initMatrix(canvasId, opacity = 0.8) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('Matrix canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get canvas context');
        return;
    }

    // Matrix characters (katakana + latin)
    const chars = "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝABCDEF0123456789";
    const charArray = chars.split('');
    const fontSize = canvasId === 'matrixCanvas' ? 14 : 10;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(1);

    // Set initial opacity
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let lastTime = 0;
    const fps = 30;
    const interval = 1000 / fps;
    
    function draw(currentTime) {
        // Only draw if theme is cyber
        const theme = document.body.getAttribute('data-theme') || 'cyber';
        if (theme === 'boomer') {
            return;
        }
        
        // Throttle to 30fps
        if (currentTime - lastTime >= interval) {
            // Semi-transparent black background for fade effect
            ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Green text
            ctx.fillStyle = '#0F0';
            ctx.font = fontSize + 'px monospace';

            // Loop over drops
            for (let i = 0; i < drops.length; i++) {
                // Random character
                const char = charArray[Math.floor(Math.random() * charArray.length)];

                // Draw character
                ctx.fillText(char, i * fontSize, drops[i] * fontSize);

                // Reset drop or move it down
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
            
            lastTime = currentTime;
        }
        
        // Store animation ID globally
        window.matrixAnimation = requestAnimationFrame(draw);
    }

    // Start animation
    window.matrixAnimation = requestAnimationFrame(draw);
}