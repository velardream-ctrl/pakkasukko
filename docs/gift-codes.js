export const giftKinds = {
  percent: 'Процентная скидка на программу',
  fixed: 'Фиксированная скидка на программу',
  holiday: 'Без праздничной надбавки',
  program: 'Программа в подарок',
  visit: 'Весь визит в подарок',
  certificate: 'Подарочный сертификат',
};

export function discountVisit(visit, rule) {
  if (!rule || visit.remote || !Number.isInteger(visit.total) || (rule.kind === 'certificate' && rule.value > visit.total)) return visit;
  const {kind, value} = rule;
  const reductions = {
    percent: Math.round(visit.base * value / 100),
    fixed: value,
    holiday: visit.holidayExtra,
    program: visit.base,
    visit: visit.total,
    certificate: value,
  };
  const discount = Math.min(visit.total, reductions[kind] || 0, ['visit', 'certificate'].includes(kind) ? visit.total : visit.base);
  if (!discount) return visit;
  const base = Math.max(0, visit.base - discount);
  const travel = visit.total - discount - base;
  return {
    ...visit, base, travel, total: base + travel, discount, giftKind: kind,
    ...(kind === 'holiday' ? {holidayName: null, holidayExtra: 0, holidayPercent: 0} : {}),
    giftCoversTravel: travel < visit.travel,
  };
}
