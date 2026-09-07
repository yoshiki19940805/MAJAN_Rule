
  const { useState, useEffect } = React;

  // ==========================================
  // 1. 設定値
  // ==========================================
  const CONFIG = {
    strings: {
      appTitle: "麻雀ルール共有",
      manageStandardRules: "標準ルール",
      tab4p: "四人麻雀",
      tab3p: "三人麻雀",
      create4pRule: "新しいルールを作成する",
      create3pRule: "新しいルールを作成する",
      actionCopy: "コピー",
      actionDelete: "削除",
      versionPrefix: "v",
      emptyRules: "ルールが作成されていません",
    },
    appVersion: "v2.55", 
    buildDate: "2026-03-19 15:24",
  };

  // ==========================================
  // 2. メインコンポーネント (New Material Design Layout)
  // ==========================================
  function App({ rulesFromVanilla }) {
    const [activeTab, setActiveTab] = useState(4); // 4 = 四人麻雀, 3 = 三人麻雀

    const [refreshTrick, setRefreshTrick] = useState(0);

    window.triggerReactRefresh = () => setRefreshTrick(prev => prev + 1);
    
    // VanillaJS側で保存されたルールをフィルタリング
    let combinedRules = rulesFromVanilla.filter(rule => (rule.mode === '四麻' ? 4 : 3) === activeTab);

    const parseDateStr = (str) => {
      if (!str) return 0;
      const t = Date.parse(str.replace(/\//g, '-'));
      return isNaN(t) ? 0 : t;
    };

    const displayedRules = combinedRules.sort((a, b) => {
      const aIsPreset = a.presetOrder !== undefined;
      const bIsPreset = b.presetOrder !== undefined;
      // ユーザールールを先、プリセットを後に
      if (aIsPreset !== bIsPreset) return aIsPreset ? 1 : -1;
      // プリセット同士: TSV列順（presetOrder昇順）
      if (aIsPreset && bIsPreset) return a.presetOrder - b.presetOrder;
      // ユーザールール同士: 日付降順
      return parseDateStr(b.date) - parseDateStr(a.date);
    });




    const handleAction = (action, rule) => {
      switch(action) {
        case 'copy': window.duplicateRule(rule.id); break;
        case 'delete': window.askDelete(rule.id); break;
      }
    };

    return (
      <div className="app-container">
        
        {/* 固定ヘッダー */}
        <header className="pt-12 pb-4 flex justify-between items-end relative" style={{ paddingLeft: 'var(--app-padding)', paddingRight: 'var(--app-padding)' }}>
          <div className="flex-1 opacity-0 pointer-events-none"> Spacer </div>
          <div className="absolute left-0 right-0 bottom-4 text-center pointer-events-none">
            <h1 className="text-2xl font-bold tracking-tight text-theme-text inline-block pointer-events-auto">
              {CONFIG.strings.appTitle}
            </h1>
          </div>
          <div className="flex-1"></div>
        </header>

        {/* タブ切り替え */}
        <div style={{ paddingLeft: 'var(--app-padding)', paddingRight: 'var(--app-padding)' }} className="mb-5">
          <div className="flex bg-theme-segmentedBg p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab(4)}
              className={`flex-1 py-1.5 text-sm transition-all rounded ${activeTab === 4 ? 'font-semibold text-center bg-theme-surface shadow-sm text-theme-text' : 'font-medium text-center text-theme-textMuted active:bg-white/50'}`}
            >
              {CONFIG.strings.tab4p}
            </button>
            <button 
              onClick={() => setActiveTab(3)}
              className={`flex-1 py-1.5 text-sm transition-all rounded ${activeTab === 3 ? 'font-semibold text-center bg-theme-surface shadow-sm text-theme-text' : 'font-medium text-center text-theme-textMuted active:bg-white/50'}`}
            >
              {CONFIG.strings.tab3p}
            </button>
          </div>
        </div>



        {/* 新規作成ボタン */}
        <div style={{ paddingLeft: 'var(--app-padding)', paddingRight: 'var(--app-padding)' }} className="mb-6">
          <button 
            onClick={() => window.createRule(activeTab === 4 ? '四麻' : '三麻')}
            className="w-full bg-theme-primary text-white rounded-xl py-3.5 flex items-center justify-center gap-2 font-semibold shadow-sm active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[22px]">add_circle</span>
            {activeTab === 4 ? CONFIG.strings.create4pRule : CONFIG.strings.create3pRule}
          </button>
        </div>

        {/* スクロール可能なメインコンテンツ（ルール一覧） */}
        <main className="flex-1 overflow-y-auto pb-8 no-scrollbar" style={{ paddingLeft: 'var(--app-padding)', paddingRight: 'var(--app-padding)' }}>
          <div className="flex flex-col gap-3">
            {displayedRules.map((rule) => {
              const isReadOnly = rule.readonly;
              let def4 = []; let def3 = [];
              try { def4 = JSON.parse(localStorage.getItem('mahjong_default_base_4ma') || '[]'); } catch(e){}
              try { def3 = JSON.parse(localStorage.getItem('mahjong_default_base_3ma') || '[]'); } catch(e){}
              if (!Array.isArray(def4)) def4 = [];
              if (!Array.isArray(def3)) def3 = [];
              
              const isDef = (rule.mode === '四麻' && def4.includes(rule.id)) || (rule.mode === '三麻' && def3.includes(rule.id));

              return (
                <div 
                  key={rule.id} 
                  className={isReadOnly ? "bg-theme-readonlyBg p-4 rounded-2xl flex items-center justify-between shadow-sm border border-theme-border opacity-90 cursor-pointer active:opacity-60 transition-opacity" : "bg-theme-surface p-4 rounded-2xl flex items-center justify-between shadow-sm border border-theme-border/50 cursor-pointer active:opacity-60 transition-opacity"}
                  onClick={() => window.editRule(rule.id)}
                >
                  <div 
                    className="flex-1 min-w-0 pr-4 flex flex-col pointer-events-none"
                  >
                    {!isReadOnly ? (
                      <>
                        <h2 className="text-base font-semibold text-theme-text truncate">
                          {rule.name}{isDef ? <span className="text-theme-primary ml-1 text-sm">(標準ルール)</span> : ""}
                        </h2>
                        <div className="flex items-center gap-1 mt-1 text-theme-textMuted">
                          <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                          <p className="text-xs">更新: {rule.date || "2026/03/16"}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-theme-text truncate">
                              {rule.name}{isDef ? <span className="text-theme-primary ml-1 text-sm">(標準ルール)</span> : ""}
                            </h2>
                            <span className="material-symbols-outlined text-theme-textMuted text-[18px]">lock</span>
                          </div>
                          <div className="flex items-center gap-1 text-theme-textMuted">
                            <span className="material-symbols-outlined text-[14px]">verified</span>
                            <p className="text-xs">編集不可</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-theme-textMuted z-10">
                    <button 
                      onClick={(e) => { e.stopPropagation(); window.toggleDefaultBaseRule(rule.mode, rule.id); }}
                      className={`flex items-center justify-center ${isDef ? 'text-theme-primary' : 'text-theme-textMuted active:scale-90 transition-all font-inherit'}`}
                      aria-label="標準設定"
                    >
                      <span className="material-symbols-outlined text-[24px]">{isDef ? 'star' : 'star_border'}</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAction('copy', rule); }}
                      className="flex items-center justify-center hover:text-theme-primary active:scale-90 transition-all font-inherit"
                      aria-label="コピー"
                    >
                      <span className="material-symbols-outlined text-[20px]">content_copy</span>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAction('delete', rule); }}
                      className="flex items-center justify-center hover:text-theme-danger active:scale-90 transition-all font-inherit"
                      aria-label="削除"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {displayedRules.length === 0 && (
              <div className="text-center py-10 text-theme-textMuted">
                <p className="text-sm font-medium">{CONFIG.strings.emptyRules}</p>
              </div>
            )}
          </div>
        </main>

        <footer className="py-6 text-center shrink-0" style={{ paddingLeft: 'var(--app-padding)', paddingRight: 'var(--app-padding)' }}>
          {/* Firebase認証UI */}
          {(() => {
            const user = window._fbUser;
            if (user && !user.isAnonymous) {
              return (
                <div style={{
                  background: 'var(--color-surface, #fff)',
                  border: '1px solid var(--color-border, #e5e5ea)',
                  borderRadius: '12px', padding: '12px 16px', marginBottom: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>☁️</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text, #1c1c1e)' }}>クラウド同期ON</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-textMuted, #8e8e93)' }}>{user.email}</div>
                    </div>
                  </div>
                  <button onClick={() => window.signOutFirebase && window.signOutFirebase()} style={{
                    fontSize: '11px', color: 'var(--color-textMuted, #8e8e93)',
                    background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  }}>ログアウト</button>
                </div>
              );
            } else {
              return (
                <button onClick={() => window.linkToGoogle && window.linkToGoogle()} 
                disabled={window._fbSigningIn}
                style={{
                  width: '100%', padding: '12px', marginBottom: '12px',
                  background: window._fbSigningIn ? '#f5f5f5' : '#fff', 
                  border: '1px solid #dadce0', borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  cursor: window._fbSigningIn ? 'default' : 'pointer', 
                  fontSize: '13px', fontWeight: '600', 
                  color: window._fbSigningIn ? '#999' : '#3c4043',
                  transition: 'all 0.2s',
                  opacity: window._fbSigningIn ? 0.7 : 1,
                }}>
                  {window._fbSigningIn ? (
                    <>
                      <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '2px solid #dadce0', borderTopColor: '#4285F4', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></span>
                      ログイン中...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                      Googleでログイン（データをクラウド保存）
                    </>
                  )}
                </button>
              );
            }
          })()}
          <p className="text-[11px] font-medium text-theme-textMuted tracking-wider mb-1">
            {CONFIG.appVersion}
          </p>
          <p className="text-[10px] text-theme-textMuted/70">
            ビルド時刻: {CONFIG.buildDate}
          </p>
        </footer>

      </div>
    );
  }

  // Vanilla JSからのレンダリングフック
  window._renderReactHome = function() {
    if (!window.reactRoot) {
      window.reactRoot = ReactDOM.createRoot(document.getElementById('react-home-root'));
    }
    // VanillaJSの現在のステートを伝播させて再描画
    window.reactRoot.render(<App rulesFromVanilla={appData.rules} />);
  }
