// Numerador de sección (1-7) del Dashboard — copia fiel del mockup aprobado
// ("Founder Command Center", section-num: cuadrado de 19px con borde y el
// número, no un ícono) en vez del ícono por sección que tenía la primera
// pasada de este refactor.
export function SectionNum({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-[19px] h-[19px] rounded-[5px] border border-border text-[10.5px] font-semibold text-tertiary shrink-0"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}
