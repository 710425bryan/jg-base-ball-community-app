/**
 * Paste this file into the Google Form Apps Script editor.
 *
 * Required script property:
 * - FORM_REMITTANCE_SECRET: must match the Supabase Edge Function secret.
 */
const SUPABASE_FUNCTION_URL = "https://qwxzwomzoyfkorbwsscv.supabase.co/functions/v1/record-fee-remittance";

function formatFormDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return value;
}

function onFormSubmit(e) {
  try {
    if (!e || !e.response) {
      Logger.log("請從真實表單送出觸發測試，不要手動按執行。");
      return;
    }

    const itemResponses = e.response.getItemResponses();
    const responses = {};

    for (let i = 0; i < itemResponses.length; i++) {
      responses[itemResponses[i].getItem().getTitle()] = itemResponses[i].getResponse();
    }

    const getResponseValue = (keywords) => {
      for (const title in responses) {
        if (keywords.some((keyword) => title.includes(keyword))) {
          return responses[title];
        }
      }
      return "";
    };

    const playerName = getResponseValue(["球員姓名"]);
    if (!playerName) {
      Logger.log("缺少球員姓名，略過。");
      return;
    }

    let paymentItems = getResponseValue(["匯款項目"]);
    if (!Array.isArray(paymentItems)) {
      paymentItems = paymentItems ? [paymentItems] : [];
    }

    const payload = {
      player_name: playerName,
      remittance_date: formatFormDate(getResponseValue(["匯款日期"])),
      amount: getResponseValue(["匯款金額"]),
      payment_items: paymentItems,
      payment_method: getResponseValue(["匯款方式"]),
      account_last_5: getResponseValue(["匯款後5碼"]),
      other_item_note: getResponseValue(["其他", "備註"]),
    };

    const secret = PropertiesService.getScriptProperties().getProperty("FORM_REMITTANCE_SECRET");
    if (!secret) {
      Logger.log("缺少 Script Property: FORM_REMITTANCE_SECRET");
      return;
    }

    const response = UrlFetchApp.fetch(SUPABASE_FUNCTION_URL, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "x-form-secret": secret,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const status = response.getResponseCode();
    const body = response.getContentText();

    Logger.log("匯款回報 webhook 狀態碼: " + status);
    Logger.log("匯款回報 webhook 回應: " + body);
  } catch (error) {
    Logger.log("發生錯誤: " + error.toString());
  }
}
