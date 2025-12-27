const Animations = {
    dealCard: (cardEl, targetX, targetY, delay) => {
        // Start from center of screen (relative to card's final position)
        // We need to calculate offset. 
        // Assuming cardEl is placed in its final container.

        // Simpler: Force card start position to center of screen fixed coordinates
        // Then animate to natural position.

        const rect = cardEl.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const deltaX = centerX - (rect.left + rect.width / 2);
        const deltaY = centerY - (rect.top + rect.height / 2);

        gsap.from(cardEl, {
            x: deltaX,
            y: deltaY,
            scale: 0.2,
            opacity: 0,
            duration: 0.8,
            delay: delay,
            ease: "back.out(1.2)",
            onComplete: () => {
                cardEl.classList.add('loaded');
                gsap.set(cardEl, { clearProps: "x,y,scale,opacity" }); // Clean up GSAP inline styles
            }
        });
    },

    playCard: (cardEl, fromRect) => {
        // Animate from hand position to trick pile position
        // cardEl is now in trick pile.
        // fromRect is the bounding box of where the card was in hand/seat.

        const toRect = cardEl.getBoundingClientRect();

        const startX = fromRect.left - toRect.left;
        const startY = fromRect.top - toRect.top;

        gsap.from(cardEl, {
            x: startX,
            y: startY,
            rotation: Math.random() * 20 - 10,
            duration: 0.5,
            ease: "power2.out",
            onComplete: () => {
                gsap.set(cardEl, { clearProps: "x,y,rotation" });
            }
        });
    },

    playCard: (cardEl, fromRect, delay = 0) => {
        const toRect = cardEl.getBoundingClientRect();

        // Ensure toRect is valid (if display none or detached, this might fail)
        if (toRect.width === 0) return;

        // Calculate delta to animate FROM hand TO table
        const startX = fromRect.left - toRect.left;
        const startY = fromRect.top - toRect.top;

        gsap.from(cardEl, {
            x: startX,
            y: startY,
            rotation: Math.random() * 20 - 10, // A bit of randomness
            duration: 0.5,
            ease: "power2.out",
            onComplete: () => {
                // CRITICAL: Clear GSAP props so CSS positioning takes over
                gsap.set(cardEl, { clearProps: "all" });
                cardEl.classList.add('loaded'); // Restore transitions
            }
        });
    },

    collectTrick: (cardEls, winnerSeatIndex, mySeatIndex) => {
        // Animate all cards in trick moving towards winner's position

        // Calculate winner position relative to my view
        // 0: Bottom (Me), 1: Right, 2: Top, 3: Left (Circular/Diamond offset)
        // Wait, seat logic in GameState is 0,1,2,3.
        // My view relative logic:
        // offset = (winnerSeatIndex - mySeatIndex + 4) % 4
        // 0=Bottom, 1=Left, 2=Top, 3=Right (Wait, standard Clockwise: Left is 1? No. 
        // Players array usually P0, P1, P2, P3. 
        // If I am P0. P1 is Left? Or Right?
        // Indian games usually anti-clockwise? Or clockwise? Defaulting clockwise.
        // P0(Me) -> P1(Left) -> P2(Top) -> P3(Right).

        let targetSelector = '#my-seat';
        const offset = (winnerSeatIndex - mySeatIndex + 4) % 4;

        if (offset === 1) targetSelector = '#opponent-left';
        if (offset === 2) targetSelector = '#opponent-top';
        if (offset === 3) targetSelector = '#opponent-right';

        const targetEl = document.querySelector(targetSelector);
        const targetRect = targetEl.getBoundingClientRect();
        const centerX = targetRect.left + targetRect.width / 2;
        const centerY = targetRect.top + targetRect.height / 2;

        cardEls.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const deltaX = centerX - (rect.left + rect.width / 2);
            const deltaY = centerY - (rect.top + rect.height / 2);

            gsap.to(el, {
                x: deltaX,
                y: deltaY,
                scale: 0.2,
                opacity: 0,
                duration: 0.8,
                delay: i * 0.1,
                ease: "power2.in",
                onComplete: () => el.remove()
            });
        });
    },

    spinDealer: (dealerIndex, mySeatIndex, dealerName) => {
        const spinner = document.getElementById('dealer-spinner');
        spinner.classList.remove('hidden');

        // Calculate angle
        // 0 (Me): 180 deg? Arrow pointing down? 
        // Top (2): 0 deg
        // Left (1): -90 deg
        // Right (3): 90 deg

        // Offset: (dealerIndex - mySeatIndex + 4) % 4
        // 0 (Me) -> Point Down (180)
        // 1 (Left) -> Point Left (-90 / 270)
        // 2 (Top) -> Point Up (0)
        // 3 (Right) -> Point Right (90)

        const offset = (dealerIndex - mySeatIndex + 4) % 4;
        let rotation = 180; // Default me
        if (offset === 1) rotation = 270;
        if (offset === 2) rotation = 0; // Top
        if (offset === 3) rotation = 90;

        // Add extra spins
        const finalRotation = rotation + 1080;

        gsap.fromTo('.spinner .arrow',
            { rotation: 0 },
            {
                rotation: finalRotation,
                duration: 3,
                ease: "power4.out"
            }
        );

        setTimeout(() => {
            spinner.classList.add('hidden');

            // Show Dealer Name
            const textEl = document.getElementById('dealer-text');
            if (textEl && dealerName) {
                textEl.innerText = `${dealerName} is Dealing`;
                textEl.classList.remove('hidden');
                requestAnimationFrame(() => textEl.classList.add('visible'));

                setTimeout(() => {
                    textEl.classList.remove('visible');
                    setTimeout(() => textEl.classList.add('hidden'), 500);
                }, 3000);
            }
        }, 3200);
    },

    winningCelebration: (teamId) => {
        // Handled by startFireworks in client loop context
    },

    startFireworks: () => {
        const container = document.getElementById('fireworks-canvas');
        if (!container) return;

        // Clear previous
        container.innerHTML = '';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        container.appendChild(canvas);

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const particles = [];

        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });

        class Particle {
            constructor(x, y, color) {
                this.x = x;
                this.y = y;
                this.color = color;
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 2 + 1; // Slower speed (was 5 + 2)
                this.dx = Math.cos(angle) * speed;
                this.dy = Math.sin(angle) * speed;
                this.alpha = 1;
                this.decay = Math.random() * 0.01 + 0.005; // Slower decay (longer life)
            }

            draw() {
                ctx.globalAlpha = this.alpha;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            update() {
                this.x += this.dx;
                this.y += this.dy;
                this.dy += 0.05; // gravity
                this.alpha -= this.decay;
                this.draw();
            }
        }

        function explode(x, y) {
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            for (let i = 0; i < 50; i++) {
                particles.push(new Particle(x, y, color));
            }
        }

        function loop() {
            ctx.clearRect(0, 0, width, height);

            // Random explosions
            if (Math.random() < 0.05) {
                explode(Math.random() * width, Math.random() * height / 2);
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                if (particles[i].alpha <= 0) particles.splice(i, 1);
            }

            Animations.fireworksId = requestAnimationFrame(loop);
        }

        loop();
    },

    stopFireworks: () => {
        if (Animations.fireworksId) {
            cancelAnimationFrame(Animations.fireworksId);
            Animations.fireworksId = null;
        }
        const container = document.getElementById('fireworks-canvas');
        if (container) container.innerHTML = '';
    }
};
