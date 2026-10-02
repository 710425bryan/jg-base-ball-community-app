// ── 常數定義 ────────────────────────────────────────────────
export const ACTIONS = [
  {
    key: 'VIEW',
    label: '檢視',
    desc: '可瀏覽頁面與資料列表',
    headerClass: 'text-blue-500',
    dotClass: 'bg-blue-400',
    legendClass: 'text-blue-500',
    checkedClass: 'border-blue-400 bg-blue-50 text-blue-600',
    checkedMobileClass: 'border-blue-400 bg-blue-50 text-blue-600'
  },
  {
    key: 'CREATE',
    label: '新增',
    desc: '可建立新資料',
    headerClass: 'text-emerald-500',
    dotClass: 'bg-emerald-400',
    legendClass: 'text-emerald-600',
    checkedClass: 'border-emerald-400 bg-emerald-50 text-emerald-600',
    checkedMobileClass: 'border-emerald-400 bg-emerald-50 text-emerald-600'
  },
  {
    key: 'EDIT',
    label: '修改',
    desc: '可編輯或審核資料',
    headerClass: 'text-amber-600',
    dotClass: 'bg-amber-400',
    legendClass: 'text-amber-600',
    checkedClass: 'border-amber-400 bg-amber-50 text-amber-600',
    checkedMobileClass: 'border-amber-400 bg-amber-50 text-amber-600'
  },
  {
    key: 'DELETE',
    label: '刪除',
    desc: '可刪除或作廢資料',
    headerClass: 'text-red-500',
    dotClass: 'bg-red-400',
    legendClass: 'text-red-500',
    checkedClass: 'border-red-400 bg-red-50 text-red-600',
    checkedMobileClass: 'border-red-400 bg-red-50 text-red-600'
  }
]

export const systemFeatures = [
  {
    key: 'leave_requests',
    name: '請假系統',
    desc: '新增、檢核請假單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'players',
    name: '球員名單',
    desc: '檢視、編輯所有球員基本資料',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'registration_forms',
    name: '賽事報名管理',
    desc: '管理賽事、可重用範本，並從完整球員名單產生含個資的報名表',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'baseball_ability',
    name: '棒球能力數據',
    desc: '檢視與維護跑壘、球速、擊球與傳接球測驗',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'physical_tests',
    name: '體能測驗數據',
    desc: '檢視與維護身體數值、速度、柔軟度與爆發力測驗',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'users',
    name: '人員與權限設定',
    desc: '管理使用者登入帳號、指定角色與權限',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'join_inquiries',
    name: '入隊申請',
    desc: '表單申請查閱、審核與回覆管理',
    actions: ['VIEW', 'EDIT', 'DELETE']
  },
  {
    key: 'announcements',
    name: '系統公告',
    desc: '發布首頁跑馬燈與系統公告',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'holiday_theme_settings',
    name: '節日主題設定',
    desc: '管理首頁節日活動、全站動畫與主題通知',
    actions: ['VIEW', 'EDIT']
  },
  {
    key: 'attendance',
    name: '點名系統',
    desc: '建立活動並進行出缺席點名',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'training',
    name: '特訓報名',
    desc: '管理球員點數、特訓報名與錄取名單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'training_dates',
    name: '訓練項目與日期設定',
    desc: '設定訓練項目、每月訓練日期並發送日期異動通知',
    actions: ['VIEW', 'EDIT']
  },
  {
    key: 'training_locations',
    name: '場地與人員配置',
    desc: '設定訓練場地、人員分組與場地通知',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'my_coach_leave_requests',
    name: '我的教練假單',
    desc: '有效教練檢視、新增、修改與取消本人的假單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'coach_leave_requests',
    name: '教練請假管理',
    desc: '檢視、新增、修改與取消全隊教練假單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'coach_schedules',
    name: '教練排班表',
    desc: '依訓練日期、場地、比賽與特訓課指定教練',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'matches',
    name: '比賽紀錄',
    desc: '新增編輯賽事成績、先發名單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'fees',
    name: '收費管理',
    desc: '月費計算、季費/儲值管理',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'equipment',
    name: '裝備管理',
    desc: '管理裝備庫存、加購申請與付款審核',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'vendors',
    name: '廠商名單',
    desc: '管理採購廠商、交易類別與聯絡資訊',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  }
]
