import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { getFilteredNavItems } from '../config/navItems';
import { getPageConfig, getHelpImagePath } from '../config/helpAnnotations';
import '../styles/help.css';

type HelpContent = {
  summary: string;
  tips?: string[];
  notes?: { title: string; items: string[] }[];
};

const helpContentMap: Record<string, HelpContent> = {
  '/dashboard': {
    summary: 'アプリ全体の状況をひと目で確認できるホーム画面です。レベル・ストリーク・活動履歴など、トレーニングの成果が集約されます。',
    tips: [
      'ヒートマップのセルをホバー/タップすると、その日のボリューム（kg）がツールチップで表示されます。',
      'ストリーク継続でEXPボーナスが増加するため、毎日ログインするだけでも効果的です。',
      '迷ったらまずダッシュボードに戻ると全体像を把握できます。',
    ],
    notes: [
      {
        title: '継続ボーナス（EXP倍率）の仕様',
        items: [
          'トレーニング継続: 1日ごとに+14%、最大+100%（7日で上限）',
          'ログイン継続: 1日ごとに+7%、最大+50%（7日で上限）',
          '合計: 最大2.5倍（ベース1.0 + トレーニング1.0 + ログイン0.5）',
          '例: トレーニング3日連続 (+42%) + ログイン5日連続 (+35%) = +77% EXP',
        ],
      },
      {
        title: 'レベルボーナスの仕様',
        items: [
          'レベルが上がるごとに獲得EXPが+1%ずつ増加',
          '例: Lv.10 = +10%、Lv.50 = +50%、Lv.100 = +100%（上限）',
        ],
      },
      {
        title: '過去日付の記録について',
        items: [
          '過去の日付に記録を追加した場合、獲得EXPは25%に減少します',
          '1日のEXP上限も50%に制限されます',
          'ストリークには影響しません（当日の記録のみカウント）',
        ],
      },
    ],
  },
  '/gyms': {
    summary: '仙台市内のジムを条件で絞り込んで検索できます。リスト表示と地図表示を切り替えて比較できます。',
    tips: [
      '地図表示では距離感を把握しやすいので、通いやすさの判断に便利です。',
      'ジムカードのタグをクリックすると、そのタグでフィルタリングできます。',
      '条件を追加しすぎると結果が少なくなるため、段階的に絞り込むと効率的です。',
    ],
  },
  '/supplements': {
    summary: 'サプリメントをカテゴリ別に確認し、効果・ティア・摂取方法を把握できます。購入リンクから直接購入も可能です。',
    tips: [
      'ティアの見方: S = 効果が高い / A = 効果あり / B = 補助的に有効 / C = 限定的な効果',
      '総合ティアを使うと、カテゴリを横断して優先度の高いサプリを把握できます。',
      '詳細モーダルはESCキーまたは背景クリックで閉じられます。',
    ],
  },
  '/gear': {
    summary: 'トレーニングギアの種類・特徴・価格帯をまとめた画面です。各タイプのメリット・デメリットを比較できます。',
    tips: [
      '初心者は安価なタイプから始め、レベルアップに合わせて高性能なギアへ移行するのがおすすめです。',
      'モーダルはESCキーまたは背景クリックで閉じられます。',
    ],
  },
  '/exercises': {
    summary: '部位別のトレーニング種目を検索・閲覧できます。フィルタリングで目的の種目を素早く見つけられます。',
    tips: [
      '動画ありの種目にはカードにマークが付いています。',
      '初めての種目は動画を見ながら軽負荷で試すと安全です。',
      'ESCキーでモーダルを閉じられます。',
    ],
  },
  '/records': {
    summary: 'トレーニング記録の入力・閲覧・編集ができます。カレンダーで日付を選び、過去の履歴も確認できます。',
    tips: [
      '記録を保存すると自動でEXPが計算され、レベルアップ時は祝福演出が表示されます。',
      'ストリーク（継続日数）を維持するとEXPボーナスが増加します。',
      'カレンダーの日付は、記録がある日はドットで強調表示されます。',
    ],
  },
  '/settings': {
    summary: 'アプリの動作や表示をカスタマイズできます。ストリーク設定とナビゲーションの並び替えが可能です。',
    tips: [
      '無理なく継続するために、週1〜2日の休息をお勧めします（Grace Days: 1〜2がおすすめ）。',
      'よく使うページを上位に並べると、サイドバー/ボトムナビでの移動が早くなります。',
      '設定はブラウザに保存されるため、再ログイン時も維持されます。',
    ],
  },
};

export default function Help() {
  const { user } = useAuthStore();
  const { navOrder, hiddenNavItems } = useUIStore();
  const [activePath, setActivePath] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // レスポンシブ対応
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const displayItems = useMemo(() => {
    // /help と /admin/levels（管理）をヘルプタブから除外
    const allItems = getFilteredNavItems(user?.displayName, user?.loginId).filter(
      (item) => item.to !== '/help' && !item.to.startsWith('/admin')
    );
    const sortedOrder = [...navOrder];

    allItems.forEach((item) => {
      if (!sortedOrder.includes(item.to)) {
        sortedOrder.push(item.to);
      }
    });

    return sortedOrder
      .map((path) => allItems.find((item) => item.to === path))
      .filter((item): item is (typeof allItems)[number] =>
        item !== undefined && !hiddenNavItems.includes(item.to)
      );
  }, [hiddenNavItems, navOrder, user?.displayName, user?.loginId]);

  useEffect(() => {
    if (displayItems.length === 0) return;
    if (!displayItems.some((item) => item.to === activePath)) {
      setActivePath(displayItems[0].to);
    }
  }, [activePath, displayItems]);

  const activeItem = displayItems.find((item) => item.to === activePath);
  const content = activeItem ? helpContentMap[activeItem.to] : undefined;

  // 画像関連の情報
  const pageConfig = activePath ? getPageConfig(activePath) : undefined;
  const viewport = isMobile ? 'mobile' : 'desktop';

  // 画像読み込みエラーハンドラー
  const handleImageError = useCallback((imagePath: string) => {
    setImageErrors((prev) => new Set(prev).add(imagePath));
  }, []);

  // メイン画像パス
  const mainImagePath = useMemo(() => {
    if (!activePath) return '';
    return getHelpImagePath(activePath, viewport);
  }, [activePath, viewport]);

  // タブ切り替え時に画像エラーをリセット
  useEffect(() => {
    setImageErrors(new Set());
  }, [activePath]);

  return (
    <div className="container help-container">
      <section className="card">
        <h2 className="title">ヘルプ</h2>
        <p className="subtitle">各ページの目的と使い方をタブで切り替えて確認できます。</p>
      </section>

      <section className="card help-tabs-card">
        <div className="help-tabs" role="tablist" aria-label="ヘルプタブ">
          {displayItems.map((item) => (
            <button
              key={item.to}
              type="button"
              role="tab"
              aria-selected={activePath === item.to}
              className={`help-tab ${activePath === item.to ? 'active' : ''}`}
              onClick={() => setActivePath(item.to)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card help-content-card">
        <h3 className="title">{activeItem?.label || 'ヘルプ'}</h3>
        <p className="help-summary">{content?.summary || 'このページの説明は準備中です。'}</p>

        {/* メイン画面セクション */}
        {pageConfig && pageConfig.steps.length > 0 && (
          <div className="help-image-section">
            <h4 className="help-section-title">使い方</h4>
            <ol className="help-steps">
              {pageConfig.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {!imageErrors.has(mainImagePath) && (
              <div className="help-image-container">
                <img
                  src={mainImagePath}
                  alt={`${activeItem?.label || ''} の使い方`}
                  className="help-image"
                  loading="lazy"
                  onError={() => handleImageError(mainImagePath)}
                />
              </div>
            )}
          </div>
        )}

        {/* モーダルセクション */}
        {pageConfig?.modals?.map((modal) => {
          const modalImagePath = getHelpImagePath(activePath, viewport, modal.name);
          const hasModalImage = !imageErrors.has(modalImagePath);
          
          return (
            <div key={modal.name} className="help-image-section">
              <h4 className="help-section-title">{modal.label}</h4>
              <ol className="help-steps">
                {modal.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {hasModalImage && (
                <div className="help-image-container">
                  <img
                    src={modalImagePath}
                    alt={`${activeItem?.label || ''} ${modal.label}`}
                    className="help-image"
                    loading="lazy"
                    onError={() => handleImageError(modalImagePath)}
                  />
                </div>
              )}
            </div>
          );
        })}

        {content?.tips ? (
          <div className="help-section">
            <h4 className="help-section-title">ポイント</h4>
            <ul className="help-tips">
              {content.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {content?.notes?.map((note) => (
          <div className="help-section" key={note.title}>
            <h4 className="help-section-title">{note.title}</h4>
            <ul className="help-tips">
              {note.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
