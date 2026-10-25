import { createWorkBuddyCloud } from "@tencent-ai/workbuddy-cloud-sdk";

// WorkBuddy 云服务公开配置（来自云服务激活结果，可随前端代码发布）。
export const cloud = createWorkBuddyCloud({
  endpoint: "https://memodash-39193.app.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: "wbpk_jdwIut7CSg2br4SUlOM0vm_VQ3sgwNcPrkidFL4heXch2HYTpZWWhoc",
});
