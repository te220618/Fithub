export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-content">
        <p className="copyright">
          Fithub &copy; {currentYear} Ishikawa Rikuto Inc. All Rights Reserved.
        </p>
      </div>
      
      <style>{`
        .site-footer {
          /* welcome-cardと同じグラデーション */
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 165, 0, 0.1) 50%, rgba(42, 42, 42, 1) 100%);
          background-color: #000; /* 透過部分のベース色 */
          border-top: 1px solid var(--border-gold);
          color: var(--gold);
          padding: 16px 24px;
          margin-top: auto;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
          position: relative;
          overflow: hidden;
        }
        
        /* グラデーション効果を強調するためのオーバーレイ（welcome-cardの::beforeを模倣） */
        .site-footer::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -20%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(255, 215, 0, 0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        
        .site-footer-content {
          max-width: 1100px;
          margin: 0 auto;
          text-align: center;
          position: relative; /* z-index用 */
          z-index: 1;
        }

        .copyright {
          margin: 0;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
        }
      `}</style>
    </footer>
  );
}
