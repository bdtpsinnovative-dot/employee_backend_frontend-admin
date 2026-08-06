import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSpeed: number;
  size: number;
  opacity: number;
  burstTimer: number;
  burstCooldown: number;
}

const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const PARTICLE_COUNT = 200;
    const LINK_DISTANCE = 160;
    const MOUSE_RADIUS = 140;
    const COLORS = ['#14b8a6', '#10b981', '#0d9488', '#2dd4bf', '#34d399'];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const baseSpeed = Math.random() * 0.3 + 0.15; // slow drift
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        baseSpeed,
        size: Math.random() * 3 + 1,
        opacity: Math.random() * 0.5 + 0.25,
        burstTimer: 0,
        burstCooldown: Math.random() * 300 + 100, // frames until next possible burst
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Mouse repulsion
        const dx = p.x - mouseRef.current.x;
        const dy = p.y - mouseRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          p.vx += (dx / dist) * force * 0.8;
          p.vy += (dy / dist) * force * 0.8;
        }

        // Random burst: some particles suddenly speed up
        p.burstCooldown--;
        if (p.burstCooldown <= 0 && p.burstTimer <= 0) {
          // ~8% chance to burst each time cooldown resets
          if (Math.random() < 0.08) {
            p.burstTimer = 40 + Math.random() * 30; // burst lasts 40-70 frames
            const burstAngle = Math.random() * Math.PI * 2;
            const burstForce = 1.5 + Math.random() * 2;
            p.vx = Math.cos(burstAngle) * burstForce;
            p.vy = Math.sin(burstAngle) * burstForce;
          }
          p.burstCooldown = Math.random() * 200 + 80;
        }

        // Apply damping based on burst state
        if (p.burstTimer > 0) {
          p.burstTimer--;
          p.vx *= 0.985; // lighter damping during burst (stays fast longer)
          p.vy *= 0.985;
        } else {
          // Slowly return to gentle drift speed
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed > p.baseSpeed) {
            p.vx *= 0.96;
            p.vy *= 0.96;
          } else if (speed < p.baseSpeed * 0.5) {
            // Give it a gentle nudge so it doesn't stop
            const nudgeAngle = Math.random() * Math.PI * 2;
            p.vx += Math.cos(nudgeAngle) * 0.02;
            p.vy += Math.sin(nudgeAngle) * 0.02;
          }
        }

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -1; }

        // Draw particle (glow effect during burst)
        const color = COLORS[i % COLORS.length];
        const isBursting = p.burstTimer > 0;
        const drawSize = isBursting ? p.size * 1.5 : p.size;
        const drawOpacity = isBursting ? Math.min(p.opacity * 1.8, 1) : p.opacity;

        if (isBursting) {
          // Glow effect
          ctx.beginPath();
          ctx.arc(p.x, p.y, drawSize * 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = drawOpacity * 0.15;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = drawOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw links
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = '#14b8a6';
            ctx.globalAlpha = 0.12 * (1 - dist / LINK_DISTANCE);
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[1]"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default AnimatedBackground;

