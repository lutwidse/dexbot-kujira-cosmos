// FIN
export function msg_submit_order(
  uusk_amount: string,
  collateral_liquidation_price: string
) {
  return {
    submit_order: {
      amount: (parseInt(uusk_amount) * 1000000).toString(),
      price: collateral_liquidation_price.toString(),
      denom: {
        native: 'USK_DENOM'
      }
    }
  };
}

export function msg_withdraw_order(order_idxs: string[]) {
  return {
    withdraw_orders: {
      order_idxs: [order_idxs]
    }
  };
}

export function msg_swap() {
  return {
    swap: {}
  };
}

// ORCA
export function msg_submit_bid(premium: number) {
  return {
    submit_bid: {
      premium_slot: premium,
      delegate: 'kujira16a03hk5ev6963a4yj3kcrvmh4hej3w3j70kv2n'
    }
  };
}

export function msg_retract_bid(bids_idx: string) {
  return {
    retract_bid: {
      bid_idx: bids_idx
    }
  };
}

export function msg_claim_liquidations(bids_idxs: string[]) {
  return {
    claim_liquidations: {
      bids_idx: bids_idxs
    }
  };
}
