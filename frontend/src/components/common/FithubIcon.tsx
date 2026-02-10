import { useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import '../../styles/fithub-icon.css';

interface FithubIconProps {
    /** アイコンサイズ (px) */
    size?: number;
    /** 現在のレベル */
    level?: number;
    /** 粒子表示の有無 */
    showParticles?: boolean;
    /** クラス名 */
    className?: string;
}

/**
 * レベルに応じた色とティア内進捗を取得
 */
function getLevelInfo(level: number): {
    main: string;
    glow: string;
    tierProgress: number;
} {
    if (level >= 50) {
    // Lv.50+ : 赤（レジェンド）
    return {
        main: '#FF0000',
        glow: 'rgba(255, 0, 0, 0.6)',
        tierProgress: 1
    };

} else if (level >= 40) {
    // Lv.40-49 : 黄色
    const progress = (level - 40) / 10;
    return {
        main: '#FFD700',
        glow: 'rgba(255, 215, 0, 0.6)',
        tierProgress: progress
    };

} else if (level >= 30) {
    // Lv.30-39 : 紫
    const progress = (level - 30) / 10;
    return {
        main: '#800080',
        glow: 'rgba(128, 0, 128, 0.6)',
        tierProgress: progress
    };

} else if (level >= 20) {
    // Lv.20-29 : 青
    const progress = (level - 20) / 10;
    return {
        main: '#1E90FF',
        glow: 'rgba(30, 144, 255, 0.6)',
        tierProgress: progress
    };

} else if (level >= 10) {
    // Lv.10-19 : 緑
    const progress = (level - 10) / 10;
    return {
        main: '#32CD32',
        glow: 'rgba(50, 205, 50, 0.6)',
        tierProgress: progress
    };

} else {
    // Lv.1-9 : 白
    const progress = (level - 1) / 9;
    return {
        main: '#FFFFFF',
        glow: 'rgba(255, 255, 255, 0.6)',
        tierProgress: progress
    };
}
}
/**
 * Fithubアニメーションアイコン
 */
export default function FithubIcon({
    size = 36,
    level = 1,
    showParticles = true,
    className = '',
}: FithubIconProps) {
    const { iconAnimation } = useUIStore();
    const { main: levelColor, glow: glowColor, tierProgress } = useMemo(
        () => getLevelInfo(level),
        [level]
    );

    // 粒子数（ティア内進捗に応じて2〜12個）
    const particleCount = useMemo(() => {
        if (!showParticles) return 0;
        return Math.min(12, Math.floor(tierProgress * 10) + 2);
    }, [tierProgress, showParticles]);

    // 粒子の位置
    const particles = useMemo(() => {
        return Array.from({ length: particleCount }, (_, i) => ({
            id: i,
            left: 20 + Math.random() * 60,
            top: 30 + Math.random() * 50,
            size: 2 + Math.random() * 2,
            duration: 1.5 + Math.random() * 1,
        }));
    }, [particleCount]);

    // グロー強度（ティア内進捗に連動）
    const glowIntensity = 4 + tierProgress * 16;

    // mask用スタイル
    const maskStyle: React.CSSProperties = {
        width: size,
        height: size,
        backgroundColor: levelColor,
        WebkitMaskImage: "url('/images/Fithubicon.webp')",
        maskImage: "url('/images/Fithubicon.webp')",
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
    };

    return (
        <div
            className={`fithub-icon-container ${!iconAnimation ? 'no-animation' : ''} ${className}`}
            style={{
                width: size,
                height: size,
                '--glow-size': `${glowIntensity}px`,
                '--glow-color': glowColor,
            } as React.CSSProperties}
        >
            {/* グロー用レイヤー */}
            <div
                className="fithub-icon-glow"
                style={maskStyle}
            />
            {/* メインアイコン */}
            <div
                className="fithub-icon-image"
                style={maskStyle}
                role="img"
                aria-label="Fithub"
            />

            {showParticles && particleCount > 0 && (
                <div className="fithub-icon-particles">
                    {particles.map((p) => (
                        <span
                            key={p.id}
                            className="fithub-particle"
                            style={{
                                left: `${p.left}%`,
                                top: `${p.top}%`,
                                width: p.size,
                                height: p.size,
                                animationDuration: `${p.duration}s, 1s`,
                                background: levelColor,
                                boxShadow: `0 0 3px ${levelColor}`,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
