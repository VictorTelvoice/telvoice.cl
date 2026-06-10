/** @deprecated Import from postPurchaseNotificationService instead. */
export {
  assessAllPostPurchaseNotifications as assessAllPurchaseActivationNotices,
  assessPostPurchaseNotifications as assessPurchaseActivationNotice,
  POST_PURCHASE_SEND_CONFIRM,
  PURCHASE_ACTIVATION_SEND_CONFIRM,
  sendAllPostPurchaseNotifications as sendAllPurchaseActivationNotices,
  sendPostPurchaseNotifications,
  sendPurchaseActivationNotice,
  type PostPurchaseNotificationPlan as PurchaseActivationNoticeRow,
} from "./postPurchaseNotificationService.js";
