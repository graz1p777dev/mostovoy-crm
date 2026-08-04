/**
 * Светящийся шар-лоадер: несколько слоёв конического градиента вращаются с
 * разной скоростью и в разные стороны, поверх медленно плывёт оттенок.
 *
 * «Случайность» здесь детерминированная: периоды слоёв (3.7s / 5.3s / 8.9s /
 * 13.1s) взаимно непериодичны, поэтому картинка повторяется примерно раз в
 * несколько часов — глазу кажется, что шар переливается непредсказуемо.
 * Math.random() не используется намеренно: на SSR он дал бы рассинхрон гидратации.
 *
 * Не GIF: палитра в 256 цветов даёт полосы на градиенте, а вектор чёток на любом DPI.
 * При prefers-reduced-motion анимации отключаются — остаётся статичный шар.
 */
export default function GlowOrb({
  size = 72,
  label = 'Загрузка',
}: {
  size?: number
  label?: string
}) {
  return (
    <div
      className="glow-orb"
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    >
      <span className="glow-orb__halo" />
      <span className="glow-orb__core" />
      <span className="glow-orb__drift" />
      <span className="glow-orb__sheen" />

      <style
        dangerouslySetInnerHTML={{
          __html: `
.glow-orb {
  position: relative;
  display: grid;
  place-items: center;
  isolation: isolate;
  animation: glow-orb-hue 13.1s linear infinite;
}
.glow-orb > span {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
}
/* Ореол: размытая копия градиента, пульсирует.
   Палитра только тёплая — от фирменного красного к коралловому и обратно.
   Радуги здесь быть не должно: загрузка — не праздник. */
.glow-orb__halo {
  background: conic-gradient(from 0deg,
    var(--brand), var(--accent-to), var(--series-soft), var(--accent-to), var(--brand-ink), var(--brand));
  filter: blur(10px);
  opacity: 0.5;
  animation: glow-orb-spin 3.7s linear infinite, glow-orb-pulse 2.3s ease-in-out infinite;
}
/* Ядро: тот же градиент, чётко, вращается медленнее и в обратную сторону */
.glow-orb__core {
  background: conic-gradient(from 90deg,
    var(--brand), var(--brand-ink), var(--accent-to), var(--series-soft), var(--brand));
  animation: glow-orb-spin 5.3s linear infinite reverse;
  box-shadow: inset 0 0 18px rgba(28, 20, 22, 0.42);
}
/* Дрейф: третий слой с иным набором остановок, смешивается с ядром —
   именно он ломает периодичность и даёт «случайные» сочетания оттенков */
.glow-orb__drift {
  background: conic-gradient(from 210deg,
    transparent 0deg, var(--brand-light) 60deg, transparent 130deg,
    var(--orange-soft) 190deg, transparent 260deg, var(--accent-to) 320deg, transparent 360deg);
  mix-blend-mode: screen;
  opacity: 0.45;
  filter: blur(3px);
  animation: glow-orb-spin 8.9s linear infinite;
}
/* Блик: делает шар объёмным, стоит на месте */
.glow-orb__sheen {
  background:
    radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.16) 26%, transparent 52%),
    radial-gradient(circle at 68% 78%, rgba(28,20,22,0.32) 0%, transparent 55%);
}
@keyframes glow-orb-spin {
  to { transform: rotate(360deg); }
}
@keyframes glow-orb-pulse {
  0%, 100% { opacity: 0.42; transform: scale(1); }
  50%      { opacity: 0.72; transform: scale(1.12); }
}
/* Мягкий сдвиг оттенка: ±18°, чтобы не уехать из фирменной палитры */
@keyframes glow-orb-hue {
  0%, 100% { filter: hue-rotate(-18deg); }
  50%      { filter: hue-rotate(18deg); }
}
@media (prefers-reduced-motion: reduce) {
  .glow-orb,
  .glow-orb__halo,
  .glow-orb__core,
  .glow-orb__drift { animation: none; }
}
`,
        }}
      />
    </div>
  )
}
