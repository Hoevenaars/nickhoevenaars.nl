function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function hasAmount(value) {
  return String(value ?? '').trim() !== ''
}

export function resolveAllocations(rows, total) {
  const linked = (rows || []).filter((r) => r.customer_id)
  if (!linked.length) return []
  const withAmt = linked.filter((r) => hasAmount(r.amount))
  const without = linked.filter((r) => !hasAmount(r.amount))
  const asRow = (customerId, amount) => ({
    customer_id: customerId,
    amount: roundMoney(amount)
  })

  if (without.length && !withAmt.length) {
    const each = roundMoney(Number(total) / without.length)
    return without.map((r, i) => asRow(
      r.customer_id,
      i === without.length - 1
        ? roundMoney(Number(total) - each * (without.length - 1))
        : each
    ))
  }
  if (without.length === 1) {
    const used = withAmt.reduce((s, r) => s + Number(r.amount), 0)
    return [
      ...withAmt.map((r) => asRow(r.customer_id, Number(r.amount))),
      asRow(without[0].customer_id, Math.max(0, Number(total) - used))
    ]
  }
  return withAmt.map((r) => asRow(r.customer_id, Number(r.amount)))
}

export function allocationsToSave(rows) {
  return (rows || [])
    .filter((r) => r.customer_id && Number.isFinite(Number(r.amount)) && Number(r.amount) >= 0)
    .map((r) => ({ customer_id: r.customer_id, amount: Number(r.amount) }))
}
