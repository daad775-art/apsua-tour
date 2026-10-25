// 14.0: what a tourist is told when their request changes (push + the in-site attention marker).
const rub = (n: unknown) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('ru-RU') + ' ₽' : '';
const label = (kind: string) => (kind === 'transfers' ? 'Трансфер' : 'Заявка');

/** Returns the notification for a change of a request, or null when nothing the tourist cares about changed. */
export function orderNotification(before: any, after: any, code: string, kind: string): { title: string; body: string; tag: string } | null {
  const number = String(after.dispatchNumber || code), name = `${label(kind)} ${number}`, tag = 'order-' + code;
  const vehicle = after.assignedVehicle, guide = after.assignedGuide;
  const vehicleKey = (v: any) => v ? [v.title || v.name || v.model, v.registration, v.driver?.name].join('|') : '';
  if (before.status !== after.status) {
    switch (after.status) {
      case 'confirmed': return { title: `${name} подтверждена`, body: 'Скоро здесь появится QR для оплаты.', tag };
      case 'awaiting_payment': return { title: `Оплатите: ${name}`, body: `QR для оплаты${after.payment?.amount ? ' · ' + rub(after.payment.amount) : ''}. Откройте заявку на сайте.`, tag };
      case 'paid': return { title: 'Оплата получена', body: `${name}. ${kind === 'transfers' ? 'Водителя пришлём за 24 часа до выезда.' : 'Экскурсовода и машину пришлём после назначения.'}`, tag };
      case 'rejected': return { title: `${name} отклонена`, body: String(after.rejectionReason || 'Откройте заявку, чтобы выбрать другую дату.').slice(0, 300), tag };
      case 'needs_info': return { title: 'Нужно уточнение', body: `${name}: диспетчер задал вопрос.`, tag };
      case 'cancelled': return after.cancelledBy === 'customer' ? null : { title: `${name} отменена`, body: 'Откройте заявку, чтобы узнать подробности.', tag };
      case 'completed': return { title: 'Спасибо за поездку!', body: 'Будем рады вашему отзыву.', tag };
    }
  }
  if (vehicleKey(vehicle) !== vehicleKey(before.assignedVehicle) && (vehicle?.title || vehicle?.name || vehicle?.model)) {
    const time = after.pickupTime ? ` Подача в ${String(after.pickupTime).slice(0, 20)}.` : '';
    return { title: kind === 'transfers' ? 'Водитель назначен' : 'Машина назначена', body: `${vehicle.title || vehicle.name || vehicle.model}${vehicle.registration ? ', ' + vehicle.registration : ''}.${time}`.slice(0, 300), tag };
  }
  if ((guide?.name || '') !== (before.assignedGuide?.name || '') && guide?.name) return { title: 'Экскурсовод назначен', body: `${guide.name}. Контакты — в заявке.`, tag };
  if ((after.pickupTime || '') !== (before.pickupTime || '') && after.pickupTime) return { title: 'Время подачи', body: `${name}: подача в ${String(after.pickupTime).slice(0, 20)}.`, tag };
  return null;
}
