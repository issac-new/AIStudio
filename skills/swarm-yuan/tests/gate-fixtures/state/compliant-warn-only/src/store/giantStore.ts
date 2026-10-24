// 巨型 store 违例样本：用户/订单/库存/营销/客服/物流/通知多领域塞入单一 reducer（行数超阈值 100）
// 风险：改任一字段全组件重渲染；现行 check_state 对该气味仅 warn 披露
interface State {
  [key: string]: unknown;
}

const initialState: State = {
  userProfile: null,
  userToken: '',
  userSettings: null,
  userAddresses: [],
  orderList: [],
  orderDetail: null,
  orderRefund: null,
  orderInvoice: null,
  stockSku: {},
  stockWarehouse: {},
  promoCoupon: [],
  promoCampaign: null,
  supportTicket: [],
  supportSession: null,
  logisticsRoute: [],
  logisticsTrack: null,
  notifyInbox: [],
  notifyUnread: 0,
};

export function appReducer(
  state = initialState,
  action: { type: string; payload?: unknown },
): State {
  switch (action.type) {
    case 'user/login':
      return { ...state, userToken: action.payload };
    case 'user/logout':
      return { ...state, userToken: '', userProfile: null };
    case 'user/profileLoaded':
      return { ...state, userProfile: action.payload };
    case 'user/settingsSaved':
      return { ...state, userSettings: action.payload };
    case 'user/addressAdded':
      return { ...state, userAddresses: action.payload };
    case 'user/addressRemoved':
      return { ...state, userAddresses: action.payload };
    case 'order/listLoaded':
      return { ...state, orderList: action.payload };
    case 'order/detailLoaded':
      return { ...state, orderDetail: action.payload };
    case 'order/created':
      return { ...state, orderDetail: action.payload };
    case 'order/paid':
      return { ...state, orderDetail: action.payload };
    case 'order/cancelled':
      return { ...state, orderDetail: action.payload };
    case 'order/refundRequested':
      return { ...state, orderRefund: action.payload };
    case 'order/refundApproved':
      return { ...state, orderRefund: action.payload };
    case 'order/refundRejected':
      return { ...state, orderRefund: action.payload };
    case 'order/invoiceIssued':
      return { ...state, orderInvoice: action.payload };
    case 'stock/skuLoaded':
      return { ...state, stockSku: action.payload };
    case 'stock/skuDeducted':
      return { ...state, stockSku: action.payload };
    case 'stock/warehouseLoaded':
      return { ...state, stockWarehouse: action.payload };
    case 'stock/warehouseSynced':
      return { ...state, stockWarehouse: action.payload };
    case 'promo/couponLoaded':
      return { ...state, promoCoupon: action.payload };
    case 'promo/couponClaimed':
      return { ...state, promoCoupon: action.payload };
    case 'promo/campaignLoaded':
      return { ...state, promoCampaign: action.payload };
    case 'promo/campaignJoined':
      return { ...state, promoCampaign: action.payload };
    case 'support/ticketLoaded':
      return { ...state, supportTicket: action.payload };
    case 'support/ticketCreated':
      return { ...state, supportTicket: action.payload };
    case 'support/ticketClosed':
      return { ...state, supportTicket: action.payload };
    case 'support/sessionOpened':
      return { ...state, supportSession: action.payload };
    case 'support/sessionEnded':
      return { ...state, supportSession: null };
    case 'logistics/routeLoaded':
      return { ...state, logisticsRoute: action.payload };
    case 'logistics/trackLoaded':
      return { ...state, logisticsTrack: action.payload };
    case 'logistics/trackRefreshed':
      return { ...state, logisticsTrack: action.payload };
    case 'notify/inboxLoaded':
      return { ...state, notifyInbox: action.payload };
    case 'notify/read':
      return { ...state, notifyUnread: 0 };
    case 'notify/pushed':
      return { ...state, notifyUnread: action.payload };
    default:
      return state;
  }
}
