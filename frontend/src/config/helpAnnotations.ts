/**
 * ヘルプ画像生成用のアノテーション設定
 * 各ページのUI要素をセレクタで指定し、番号バッジを自動配置
 */

export type AnnotationConfig = {
  selector: string;
  // オプション: 複数マッチ時のインデックス（デフォルト: 0 = 最初の要素）
  index?: number;
  // オプション: 要素が見つからなくてもエラーにしない
  optional?: boolean;
  // オプション: バッジ位置の調整（'center' | 'right' | 'left'）
  align?: 'center' | 'right' | 'left';  // オプション: X座標のオフセット(px)
  offsetX?: number;
  // オプション: Y座標のオフセット(px)
  offsetY?: number;};

export type ModalConfig = {
  // ファイル名サフィックス（例: 'modal_select' → records_modal_select.png）
  name: string;
  // 表示用ラベル（例: '記録モーダル（種目選択）'）
  label: string;
  // モーダルを開くためのクリック対象セレクタ
  trigger: string;
  // モーダルが開いたことを確認するセレクタ
  waitSelector: string;
  // モーダル内のアノテーション
  annotations: AnnotationConfig[];
  // このモーダルの使い方ステップ（①②③...に対応）
  steps: string[];
  // 追加操作（種目選択→入力への遷移など）
  beforeCapture?: { click?: string; wait?: string; waitMs?: number }[];
  // スクショ対象のセレクタ（waitSelectorと異なる場合に指定）
  captureSelector?: string;
};

export type PageConfig = {
  path: string;
  label: string;
  // 各アノテーションはsteps配列のインデックスに対応
  annotations: AnnotationConfig[];
  // メイン画面の使い方ステップ（①②③...に対応）
  steps: string[];
  // ページ読み込み後の追加待機（ms）
  waitAfterLoad?: number;
  // モーダル設定
  modals?: ModalConfig[];
};

export const helpPages: PageConfig[] = [
  {
    path: '/dashboard',
    label: 'ダッシュボード',
    annotations: [
      { selector: '.welcome-card' },           // 1. ウェルカムカード
      { selector: '.level-card' },             // 2. レベルカード
      { selector: '.stats-grid' },             // 3. 統計カード（6つ）
      { selector: '.heatmap-section' },        // 4. ヒートマップ
      { selector: '.card-actions' },           // 5. クイックアクション
      { selector: '.recent-records-card' },    // 6. 最近の記録
      { selector: '.volume-chart-card' },      // 7. 週間ボリューム
      { selector: '.recovery-status-card' },   // 8. コンディション
    ],
    steps: [
      'ウェルカムカードで名前と今日の日付を確認します。',
      'レベルカードで現在のレベルとEXP進捗バーを見て、次のレベルまでの経験値を把握します。',
      '統計カード（6つ）で週のワークアウト数・総重量・トレーニング継続日数・ログイン継続日数・最高継続記録を確認します。継続ボーナス（+○% EXP）も表示されます。',
      'アクティビティヒートマップで活動カレンダーを確認します。年/上半期・下半期/四半期のセレクターで期間を切り替えられます（モバイルではスワイプ対応）。',
      'クイックアクションから「トレーニング記録」「ジム検索」「種目を見る」へワンタップで移動します。',
      '最近の記録リストで直近7日間のトレーニング履歴（部位・種目数・セット数・獲得EXP）を確認します。',
      '週間ボリュームグラフで過去7日間の推移を棒グラフで把握します。',
      'コンディションで部位別の回復状況を確認します。「回復中」「準備OK」「ご無沙汰」の3段階で表示され、今日おすすめの部位が提案されます。',
    ],
    waitAfterLoad: 1000,
  },
  {
    path: '/gyms',
    label: 'ジム検索',
    annotations: [
      { selector: '.search-card #searchInput' },                                    // 1. 検索バー
      { selector: '.search-card #areaChips' },                                      // 2. エリアフィルター
      { selector: '.search-card #priceRange' },                                     // 3. 月額料金スライダー
      { selector: '.search-card #tagChips' },                                       // 4. 設備・施設タグ
      { selector: '.search-card .view-toggle-btn', align: 'right', offsetX: 220 }, // 5. 地図/リスト切替
      { selector: '#gymGrid .gym-card', optional: true },                           // 6. ジムカード
      { selector: '.search-card .reset-btn', align: 'right', offsetX: 220 },       // 7. リセットボタン
    ],
    steps: [
      '検索バーにキーワード（ジム名や住所）を入力します。入力は400msのデバウンス処理で自動検索されます。',
      'エリアフィルターで「青葉区」「宮城野区」「若林区」「太白区」「泉区」から選択します（複数選択可）。',
      '月額料金スライダーで上限金額を設定します（最大15,000円）。直接入力も可能です。',
      '設備・施設タグでフィルタリングします。タグは複数選択でき、クリックでトグルします。',
      '右上の「地図で表示」ボタンで地図ビューに切り替えます。マーカーをクリックするとジム情報がポップアップします。',
      'リスト表示では各ジムカードに住所・営業時間・電話番号・月額料金・タグが表示されます。',
      '「リセット」ボタンで全フィルターを初期化できます。',
    ],
    waitAfterLoad: 500,
  },
  {
    path: '/supplements',
    label: 'サプリメント',
    annotations: [
      { selector: '.category-tabs' },          // 1. カテゴリタブ
      { selector: '.category:last-child' },    // 2. 総合ティアタブ
      { selector: '.supp', optional: true },   // 3. サプリアイテム
    ],
    steps: [
      'カテゴリタブで「アミノ酸系」「プロテイン系」「ビタミン・ミネラル系」「パフォーマンス系」を切り替えます。',
      '「総合ティア」タブでは全サプリをS/A/B/Cのティア順にグループ表示します。',
      'サプリメント名をクリックすると詳細モーダルが開きます。',
    ],
    waitAfterLoad: 300,
    modals: [
      {
        name: 'modal',
        label: 'サプリ詳細モーダル',
        trigger: '.supp',
        waitSelector: '.supp-modal.show',
        annotations: [
          { selector: '.supp-modal-name' },        // 1. サプリ名
          { selector: '.supp-modal-desc' },        // 2. 説明
          { selector: '.supp-modal-cards' },       // 3. 摂取量・タイミング
          { selector: '.supp-advice-card' },       // 4. アドバイス
          { selector: '.supp-link-buttons' },      // 5. 購入リンク
        ],
        steps: [
          'サプリ名とティアランク（S/A/B/C）を確認します。',
          '「主な効果」リストで具体的な効果を確認します。',
          '「摂取量」と「タイミング」で1日の目安量と飲むタイミングを確認します。',
          '「アドバイス」で注意点やおすすめの組み合わせを読みます。',
          '「購入リンク」からAmazon・楽天・Yahoo!・iHerbなどへ直接移動できます。',
        ],
      },
    ],
  },
  {
    path: '/gear',
    label: 'トレーニングギア',
    annotations: [
      { selector: '.gear-grid' },              // 1. ギアカード一覧
      { selector: '.hint-section' },           // 2. 選び方のヒント
    ],
    steps: [
      'ギアカード一覧から気になるギアカテゴリをクリックします。各カードにはアイコン・名前・説明・タイプ数が表示されます。',
      'ページ下部の「選び方のヒント」セクションで初心者向けアドバイスを確認します。',
    ],
    waitAfterLoad: 300,
    modals: [
      {
        name: 'modal',
        label: 'ギア詳細モーダル',
        trigger: '.gear-card',
        waitSelector: '.gear-modal.show',
        annotations: [
          { selector: '#modalTitle' },             // 1. カテゴリ名
          { selector: '.type-section' },           // 2. タイプセクション
          { selector: '.feature-title.merit' },    // 3. メリット
          { selector: '.feature-title.demerit' },  // 4. デメリット
        ],
        steps: [
          'ギアカテゴリ名（例: トレーニングベルト）を確認します。',
          '各タイプ（例: 革ベルト/ナイロンベルト）を確認します。価格帯も表示されます。',
          '「メリット」でそのタイプの利点を確認します。',
          '「デメリット」で注意点を確認し、自分に合うか判断します。',
        ],
      },
    ],
  },
  {
    path: '/exercises',
    label: '筋トレ種目',
    annotations: [
      { selector: 'section.card .filters', index: 0 },             // 1. 部位フィルター
      { selector: 'section.card .filters', index: 1 },             // 2. 難易度フィルター
      { selector: 'section.card .filters', index: 2 },             // 3. ターゲット筋肉フィルター
      { selector: '#exerciseGrid .exercise', optional: true },     // 4. 種目カード
    ],
    steps: [
      '「部位」フィルターで胸・背中・肩・腕・脚などを選択します。',
      '「難易度」フィルターで初級・中級・上級を選択します。',
      '「ターゲット筋肉」フィルターで大胸筋・広背筋など細かい筋肉を複数選択できます（トグル式）。',
      '種目カードをクリックすると動画モーダルが開きます（動画がある種目のみ）。',
    ],
    waitAfterLoad: 500,
    modals: [
      {
        name: 'modal',
        label: '動画モーダル',
        trigger: '.exercise.has-video',
        waitSelector: '.video-modal.show',
        annotations: [
          { selector: '.video-modal-title' },      // 1. 種目名
          { selector: '.video-player' },           // 2. 動画プレイヤー
          { selector: '.video-controls' },         // 3. コントロール
        ],
        steps: [
          '種目名を確認します。',
          '動画プレイヤーでフォームを確認します。',
          'コントロールで再生/一時停止、シークバーで位置を調整できます。',
        ],
      },
    ],
  },
  {
    path: '/records',
    label: 'トレーニング記録',
    annotations: [
      { selector: 'section.calendar-section' },                    // 1. カレンダー
      { selector: '#calendarGrid .calendar-day.today', optional: true }, // 2. 今日の日付
      { selector: '.actions #addRecordBtn' },                      // 3. 記録追加ボタン
      { selector: '.actions #editTagsBtn' },                       // 4. タグ設定
      { selector: '#recordsListSection' },                         // 5. 過去の記録
      { selector: '#calendarGrid .calendar-day.has-pr', optional: true }, // 6. PRマーク
    ],
    steps: [
      'カレンダーで月を「<」「>」ボタンで切り替えます。「今月」ボタンで当月に戻れます。',
      '日付をクリックすると、記録がない日は新規追加モーダルが開きます。記録がある日はダイアログが表示されます。',
      '「＋ 記録をつける」ボタンで今日の日付の記録を追加できます。',
      '「タグ設定」ボタンで種目にタグを付けて分類できます。',
      '過去の記録リストで履歴を確認します。カードをクリックで展開/折りたたみ。',
      'カレンダー上の「★」マークは自己ベスト(PR)を出した日です。金色=現在のPR、グレー=過去のPR。',
    ],
    waitAfterLoad: 500,
    modals: [
      {
        name: 'modal_select',
        label: '記録モーダル（種目選択）',
        trigger: '#addRecordBtn',
        waitSelector: '.modal-overlay.active',
        annotations: [
          { selector: '#muscleTabs' },             // 1. 部位タブ
          { selector: '.default-tag-filter', optional: true }, // 2. ターゲット筋肉タブ
          { selector: '#exerciseSearch' },         // 3. 種目検索
          { selector: '#exerciseList' },           // 4. 種目リスト
          { selector: '#btnCreateCustom' },        // 5. カスタム種目作成
        ],
        steps: [
          '部位タブで胸・背中・肩など部位を選択します。',
          'ターゲット筋肉タブで細かい筋肉を選択できます。',
          '種目名を入力して検索します。',
          '種目カードをクリックして選択します。',
          '「+ カスタム種目を追加」で自分専用の種目を作成できます。',
        ],
      },
      {
        name: 'modal_input',
        label: '記録モーダル（入力）',
        trigger: '#addRecordBtn',
        waitSelector: '.modal-overlay.active',
        beforeCapture: [
          { click: '.exercise-card', wait: '#stepInputRecord', waitMs: 300 },
        ],
        annotations: [
          { selector: '#inputExerciseName' },      // 1. 種目名
          { selector: '#setsContainer' },          // 2. セット入力エリア
          { selector: '#btnAddSet' },              // 3. セット追加
          { selector: '#btnCopyPrev' },            // 4. 前回コピー
          { selector: '#btnSaveRecord' },          // 5. 保存ボタン
        ],
        steps: [
          '選択した種目名が表示されます。',
          'セット入力エリアで重量(kg)と回数(reps)を入力します。',
          '「+ セット追加」ボタンでセットを追加します。',
          '「前回コピー」ボタンで前回の記録をコピーできます。',
          '「保存」ボタンで記録を保存します。EXPが加算されます。',
        ],
      },
      {
        name: 'modal_tag',
        label: 'タグ設定モーダル',
        trigger: '#editTagsBtn',
        waitSelector: '.modal-overlay.active',
        annotations: [
          { selector: '#tagExerciseSelect' },      // 1. 種目選択
          { selector: '#defaultTagList' },         // 2. デフォルトタグ
          { selector: '#tagList' },                // 3. カスタムタグ
          { selector: '.tag-create-area' },        // 4. タグ作成エリア
        ],
        steps: [
          '種目選択でタグを設定したい種目を選びます。',
          'デフォルトタグから選択するか、クリックでトグルします。',
          'カスタムタグを追加・削除できます。',
          'タグ作成エリアで新しいタグを作成します。',
        ],
      },
      {
        name: 'modal_custom',
        label: 'カスタム種目作成モーダル',
        trigger: '#addRecordBtn',
        waitSelector: '.modal-overlay.active',
        beforeCapture: [
          { click: '#btnCreateCustom', wait: '#customExerciseModal.active, #customExerciseModal', waitMs: 500 },
        ],
        captureSelector: '#customExerciseModal',
        annotations: [
          { selector: '#customNameInput' },        // 1. 種目名入力
          { selector: '#customMuscleInput' },      // 2. 部位選択
          { selector: '#btnSaveCustom' },          // 3. 作成ボタン
        ],
        steps: [
          '種目名を入力します。',
          '部位を選択します。',
          '「作成」ボタンで新しい種目を追加します。',
        ],
      },
    ],
  },
  {
    path: '/settings',
    label: '設定',
    annotations: [
      { selector: '.settings-select' },        // 1. Grace Days設定
      { selector: '.settings-description' },   // 2. 説明文
      { selector: '.settings-save-btn' },      // 3. 保存ボタン
      { selector: '.nav-settings-list' },      // 4. メニューカスタマイズ
      { selector: '.nav-drag-handle' },        // 5. ドラッグハンドル
      { selector: '.nav-visibility-toggle' },  // 6. 表示/非表示トグル
      { selector: '.reset-settings-btn' },     // 7. デフォルトに戻す
    ],
    steps: [
      '「トレーニング設定」で「中休み許容日数（Grace Days）」を設定します。0〜3日から選択できます。',
      '説明文でGrace Daysの効果を確認します。',
      '「設定を保存」ボタンで変更を反映します。保存成功時はトーストで通知されます。',
      '「メニューカスタマイズ」でナビゲーションの順序と表示/非表示を設定します。',
      'ドラッグハンドルで順序を変更します（モバイルでは0.5秒長押しでドラッグ開始）。',
      'トグルスイッチで各ページの表示/非表示を切り替えます。「設定」は非表示にできません。',
      '「デフォルトに戻す」ボタンで順序・表示設定を初期状態にリセットできます。',
    ],
    waitAfterLoad: 300,
  },
];

// ヘルパー関数: パスからページ設定を取得
export function getPageConfig(path: string): PageConfig | undefined {
  return helpPages.find((p) => p.path === path);
}

// ヘルパー関数: 画像パスを取得（メイン画像）
export function getHelpImagePath(
  path: string,
  viewport: 'desktop' | 'mobile',
  modalName?: string
): string {
  const name = path.slice(1); // 先頭の / を除去
  const suffix = modalName ? `_${modalName}` : '';
  return `/images/help/${viewport}/${name}${suffix}.png`;
}

// ヘルパー関数: ページの全画像パスを取得（メイン + モーダル）
export function getAllImagePaths(
  path: string,
  viewport: 'desktop' | 'mobile'
): string[] {
  const config = getPageConfig(path);
  if (!config) return [];

  const paths: string[] = [];

  // メイン画像
  paths.push(getHelpImagePath(path, viewport));

  // モーダル画像
  if (config.modals) {
    for (const modal of config.modals) {
      paths.push(getHelpImagePath(path, viewport, modal.name));
    }
  }

  return paths;
}
