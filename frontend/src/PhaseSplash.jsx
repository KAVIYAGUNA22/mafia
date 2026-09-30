import { useMemo } from "react";

const css = `
.ps{position:fixed;inset:0;z-index:9;pointer-events:none;overflow:hidden;animation:psFade 3.6s ease both}
@keyframes psFade{0%{opacity:0}14%{opacity:1}84%{opacity:1}100%{opacity:0}}
.ps-sky{position:absolute;inset:0}
.ps-night .ps-sky{background:radial-gradient(circle at 50% 38%,rgba(70,8,20,.96),#040406 72%)}
.ps-day .ps-sky{background:linear-gradient(#14061a 0%,#6d1f45 28%,#e0553a 55%,#ffb35c 78%,#ffe6a3 100%);
  background-size:100% 230%;animation:psDawn 3.4s ease-out both}
@keyframes psDawn{from{background-position:0 0}to{background-position:0 100%}}

.ps-star{position:absolute;width:2px;height:2px;border-radius:50%;background:#ffd9d2;animation:psTw 2.4s ease-in-out infinite}
@keyframes psTw{50%{opacity:.15}}

/* evil moon */
.ps-moon{position:absolute;left:50%;top:5%;width:min(52vw,52vh,520px);translate:-50% 0;
  animation:psMoonUp 3.2s cubic-bezier(.2,.8,.3,1) both;filter:drop-shadow(0 0 50px rgba(255,42,54,.6))}
@keyframes psMoonUp{from{transform:translateY(40vh) scale(.6);opacity:0}to{transform:none;opacity:1}}
.ps-halo{animation:psPulse 2.2s ease-in-out infinite}
@keyframes psPulse{50%{opacity:.5}}
.ps-eyes{transform-box:fill-box;transform-origin:center;animation:psEyes 3.2s ease both}
@keyframes psEyes{0%,40%{transform:scaleY(.04)}62%{transform:scaleY(1.15)}72%,100%{transform:scaleY(1)}}
.ps-grin{animation:psGrin 1.4s ease-in-out infinite}
@keyframes psGrin{50%{opacity:.55}}

/* bats and birds */
.ps-fly{position:absolute;left:-60px;animation:psFly var(--d) linear var(--dl) both}
@keyframes psFly{from{transform:translateX(0)}to{transform:translateX(calc(100vw + 120px))}}
.ps-wing{transform-box:fill-box;transform-origin:center;animation:psFlap .35s ease-in-out infinite}
@keyframes psFlap{50%{transform:scaleY(.35)}}

/* sunrise */
.ps-sun{position:absolute;left:50%;bottom:16%;width:min(58vw,58vh,560px);translate:-50% 0;
  animation:psSunUp 3.2s cubic-bezier(.2,.8,.3,1) both}
@keyframes psSunUp{from{transform:translateY(58%)}to{transform:none}}
.ps-rays{transform-box:fill-box;transform-origin:center;animation:psSpin 24s linear infinite}
@keyframes psSpin{to{transform:rotate(360deg)}}
.ps-cloud{position:absolute;height:90px;width:48vw;border-radius:50%;filter:blur(26px);
  background:radial-gradient(ellipse,rgba(255,170,150,.55),transparent 70%);animation:psDrift 6s linear both}
@keyframes psDrift{from{transform:translateX(-12vw)}to{transform:translateX(18vw)}}

.ps-city{position:absolute;left:0;right:0;bottom:0;height:28%}
.ps-city svg{width:100%;height:100%;display:block}

.ps-text{position:absolute;left:0;right:0;bottom:30%;text-align:center}
.ps-day .ps-text{top:9%;bottom:auto}
.ps-text h1{margin:0;font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(34px,6vw,68px);
  letter-spacing:.08em;animation:psRise 1.6s ease-out .5s both}
.ps-night h1{color:#ff2a36;text-shadow:0 0 40px rgba(255,42,54,.8)}
.ps-day h1{color:#fff;text-shadow:0 0 40px rgba(255,200,120,.85)}
.ps-text p{margin:6px 0 0;color:rgba(255,255,255,.78);font-size:14px;letter-spacing:.3em;
  animation:psRise 1.6s ease-out .8s both}
@keyframes psRise{from{opacity:0;transform:translateY(18px)}}

@media (prefers-reduced-motion:reduce){.ps{display:none}}
`;

const CITY =
  "M0 160V90h40v-30h30v40h30V70h40v-40h24v40h36v30h40V60h50v50h40V80h30V40h30v60h50V70h40v40h40V50h34v50h40V90h60V60h30v50h40V80h50v80z";

const Bat = ({ s = 1 }) => (
  <svg width={46 * s} height={24 * s} viewBox="-24 -12 48 24">
    <g className="ps-wing">
      <path d="M0 -2Q-8 -10 -22 -6Q-14 -2 -12 6Q-6 2 -3 7L0 2L3 7Q6 2 12 6Q14 -2 22 -6Q8 -10 0 -2Z"
        fill="#000" stroke="#ff2a36" strokeOpacity=".5" />
    </g>
  </svg>
);

const Bird = ({ s = 1 }) => (
  <svg width={30 * s} height={14 * s} viewBox="-14 -10 28 14">
    <g className="ps-wing">
      <path d="M-12 0Q-6 -8 0 0Q6 -8 12 0" stroke="#2a0f18" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  </svg>
);

function EvilMoon() {
  return (
    <svg className="ps-moon" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <radialGradient id="psMoonG" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ff9a8a" />
          <stop offset=".45" stopColor="#d1202b" />
          <stop offset="1" stopColor="#4a0810" />
        </radialGradient>
        <radialGradient id="psHaloG" cx="50%" cy="50%" r="50%">
          <stop offset=".55" stopColor="#ff2a36" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff2a36" stopOpacity="0" />
        </radialGradient>
        <filter id="psGl" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle className="ps-halo" cx="200" cy="200" r="198" fill="url(#psHaloG)" />
      <circle cx="200" cy="200" r="150" fill="url(#psMoonG)" />

      {/* craters and cracks */}
      <g fill="#6d0e17" opacity=".5">
        <circle cx="132" cy="128" r="20" /><circle cx="270" cy="120" r="14" />
        <circle cx="292" cy="246" r="18" /><circle cx="108" cy="262" r="12" /><circle cx="214" cy="92" r="9" />
      </g>
      <g stroke="#ffb09a" strokeWidth="2.2" fill="none" opacity=".75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M262 62L240 118L262 150L232 214" />
        <path d="M96 250L128 228L118 196" />
      </g>

      {/* angry eyes */}
      <g className="ps-eyes">
        <g filter="url(#psGl)" fill="#ffe27a">
          <path d="M112 172L180 190L172 208L120 200Z" />
          <path d="M288 172L220 190L228 208L280 200Z" />
        </g>
        <ellipse cx="150" cy="195" rx="3.2" ry="9" fill="#1a0205" />
        <ellipse cx="250" cy="195" rx="3.2" ry="9" fill="#1a0205" />
      </g>
      <g stroke="#2a0509" strokeWidth="9" strokeLinecap="round">
        <path d="M104 150L186 180" /><path d="M296 150L214 180" />
      </g>

      {/* grin */}
      <g className="ps-grin">
        <path d="M112 252Q200 346 288 252Q200 286 112 252Z" fill="#12020a" stroke="#ff5a4a" strokeWidth="2.5" />
        <path d="M126 262L138 284L150 270L164 294L178 276L192 300L206 276L220 294L234 270L248 284L260 262"
          stroke="#ffd9cc" strokeWidth="3" fill="none" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function Sun() {
  return (
    <svg className="ps-sun" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <radialGradient id="psSunG" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#fff8d0" />
          <stop offset=".55" stopColor="#ffb347" />
          <stop offset="1" stopColor="#ff6a3d" />
        </radialGradient>
        <radialGradient id="psSunHalo" cx="50%" cy="50%" r="50%">
          <stop offset=".3" stopColor="#ffd27a" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="200" fill="url(#psSunHalo)" />
      <g className="ps-rays" stroke="#ffe3a0" strokeWidth="6" strokeLinecap="round" opacity=".4">
        {Array.from({ length: 16 }, (_, i) => (
          <line key={i} x1="200" y1="92" x2="200" y2="30" transform={`rotate(${i * 22.5} 200 200)`} />
        ))}
      </g>
      <circle cx="200" cy="200" r="76" fill="url(#psSunG)" />
    </svg>
  );
}

export default function PhaseSplash({ phase }) {
  const night = phase === "NIGHT";

  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 60}%`,
        animationDelay: `${Math.random() * 2.4}s`,
      })),
    []
  );

  const bats = [
    { t: "16%", d: "2.6s", dl: ".4s", s: 1 },
    { t: "30%", d: "3s", dl: "1s", s: 0.7 },
    { t: "10%", d: "2.8s", dl: "1.5s", s: 0.9 },
    { t: "42%", d: "3.2s", dl: ".9s", s: 0.6 },
  ];
  const birds = [
    { t: "28%", d: "3.4s", dl: "1s", s: 1 },
    { t: "36%", d: "3.6s", dl: "1.4s", s: 0.75 },
    { t: "24%", d: "3.2s", dl: "1.8s", s: 0.6 },
  ];

  return (
    <div className={`ps ${night ? "ps-night" : "ps-day"}`} aria-hidden="true">
      <style>{css}</style>
      <div className="ps-sky" />

      {night ? (
        <>
          {stars.map((s, i) => <i key={i} className="ps-star" style={s} />)}
          <EvilMoon />
          {bats.map((b, i) => (
            <span key={i} className="ps-fly" style={{ top: b.t, "--d": b.d, "--dl": b.dl }}><Bat s={b.s} /></span>
          ))}
        </>
      ) : (
        <>
          <div className="ps-cloud" style={{ top: "34%", left: "4%" }} />
          <div className="ps-cloud" style={{ top: "48%", left: "40%", animationDelay: ".4s" }} />
          <Sun />
          {birds.map((b, i) => (
            <span key={i} className="ps-fly" style={{ top: b.t, "--d": b.d, "--dl": b.dl }}><Bird s={b.s} /></span>
          ))}
        </>
      )}

      <div className="ps-city">
        <svg viewBox="0 0 1000 160" preserveAspectRatio="none">
          <path d={CITY} fill={night ? "#050507" : "#12060c"} />
        </svg>
      </div>

      <div className="ps-text">
        <h1>{night ? "NIGHT FALLS" : "THE SUN RISES"}</h1>
        <p>{night ? "CLOSE YOUR EYES" : "THE TOWN WAKES UP"}</p>
      </div>
    </div>
  );
}
