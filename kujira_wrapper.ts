function msg_submit_order(uusk_amount: string, collateral_liquidation_price: string) {
    return {
        "submit_order": {
          "amount": (parseInt(uusk_amount)*1000000).toString(),
          "price": collateral_liquidation_price.toString(),
          "denom": {
            "native": "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk"
          }
        }
    }
}

function msg_withdraw_order(order_idxs:string[]) {
    return {
        "withdraw_orders": {
          "order_idxs": [
            order_idxs
          ]
        }
    }
}