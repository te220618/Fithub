import { useRef, useEffect } from 'react';

interface LevelUpCelebrationProps {
  newLevel: number;
  expGained: number;
  onClose: () => void;
}

export default function LevelUpCelebration({
  newLevel,
  expGained,
  onClose,
}: LevelUpCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Confetti particles
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
    }[] = [];

    const colors = ['#FFD700', '#FFA500', '#FF6347', '#4169E1', '#32CD32', '#FF69B4', '#00CED1'];

    // Create particles
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      // Remove particles that are off screen
      const remaining = particles.filter((p) => p.y < canvas.height + 20);
      if (remaining.length > 0) {
        animationId = requestAnimationFrame(animate);
      }
    };

    animate();

    // Auto close after 4 seconds
    const timeout = setTimeout(onClose, 4000);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(timeout);
    };
  }, [onClose]);

  return (
    <div
      className="level-up-overlay"
      id="levelupOverlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.9)',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          textAlign: 'center',
          zIndex: 1,
          animation: 'slideUp 0.5s ease',
        }}
      >
        <div
          style={{
            fontSize: '64px',
            marginBottom: '16px',
          }}
        >
          🎉
        </div>
        <h2
          style={{
            fontSize: '36px',
            fontWeight: 700,
            color: '#FFD700',
            textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
            marginBottom: '8px',
          }}
        >
          LEVEL UP!
        </h2>
        <div
          id="levelupNewLevel"
          style={{
            fontSize: '48px',
            fontWeight: 800,
            color: '#fff',
            marginBottom: '16px',
          }}
        >
          Lv. {newLevel}
        </div>
        <div
          style={{
            fontSize: '18px',
            color: '#9a9a9a',
          }}
        >
          +{expGained} EXP
        </div>
        <div
          style={{
            marginTop: '32px',
            fontSize: '14px',
            color: '#666',
          }}
        >
          タップして閉じる
        </div>
        <button
          id="levelupCloseBtn"
          onClick={onClose}
          style={{
            marginTop: 16,
            padding: '12px 32px',
            background: 'var(--gold)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
