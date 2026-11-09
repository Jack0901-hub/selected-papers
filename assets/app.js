/* ebook-vault 静态站点前端。
 *
 * 纯原生 JavaScript，零依赖、零构建。
 * 搜索优先：不提供分类筛选浏览。首页空搜索在 http(s) 上以 GET /api/popular 为主（按点击降序最多 20 本），
 * 不足 20 再用 home.json 推荐书补齐；合并不按搜索结果凑数。同点击次数保持原顺序。
 * 通过 http(s) 打开时，若 localStorage 里有 ebook-vault-home20-ranked，先画出这 20 张卡片，
 * 同时在后台拉 popular 与 home.json；新数据到达后替换首页并写回缓存。
 * 无缓存时显示加载中，直到第一次成功取到首页书。
 * http(s) 搜索走 Worker GET /api/search，最多 10 条，不预载 data/books 分片。
 * 搜索只列出真实命中：不足 10 本不拿推荐书或其他分类凑数；超过 10 本则 truncated。
 * 仅当 #q trim 后为空才画首页推荐 20 本；框里有任何字（含输入中、等待防抖、请求中、0 命中、出错）都不展示首页 20。
 * 首页或搜索请求失败时展示「书籍数据加载失败」和「重试」：空框重拉首页 20，有字再走搜索；file:// 同样重试失败的本地目录。出错时不显示「找到 0 本」。
 * 首页空搜索仍固定 20 张卡。/api/search 最多 10 本、/api/popular 最多 20 本会补上 link / quark_link。
 * 弹窗若仍没有可见链接，再 GET /api/book 补夸克字段。卡片下载按钮：link 与 quark_link 都空/空白则置灰，仍可点开弹窗，不 POST /api/click。
 * 用 file:// 打开时不能打 Worker，只加载同路径的 home.js / categories.js，
 * 搜索不请求 /api/search，仅能在已载入的首页 20 本里找，并提示请用网站搜索。
 * 无网络时：有缓存先显示缓存，否则用 home.js 全局变量。
 * 页面顶部是搜索框，下面是展开的书籍分类 chips（与论文页学科 chips 同一套样式）。
 * 分类来自 data/categories.json 的顶层分类，各带数量；原先末尾的文案 chip「其他 5万+」已移除。
 * 点普通 chip 把当前界面语言的分类名写入搜索框并搜索
 * （英文 Selected Papers，中文仍是 精选论文）；再点已选中的 chip 清空搜索。
 * 「精选论文」不写入搜索框。点它打开弹窗，列出 categories.json 里的子类 chips。
 * 选中子类：中文写入中文名，英文写入库内原键（Computer_Science）。点遮罩或关闭不改搜索。
 * 分类数据仍用 stale-while-revalidate：有 ebook-vault-categories 缓存先画 chips，
 * 同时拉 categories.json?v=（cache:'no-store'）。成功后同时替换 localStorage 与内存树，
 * 再按当前语言重绘 chips；失败则保留缓存，不把分类行清空。
 * 「热门开源」是顶栏 GitHub 图标，链到 github-hot.html。
 * CATEGORIES_CACHE_VERSION 同时作 SWR 版本和 http(s) 查询串，用来丢掉旧 807 树与 CDN 7 日缓存。
 * 点分类时把当前界面语言的分类名填进搜索框（英文 Selected Papers，中文仍是 精选论文），
 * 子类键保持库内原值（Arts_Humanities、Computer_Science、cs.AI）。英文界面里已有英文标签的
 * 中文子类名会换成该标签（短篇小说 → Short Stories）。搜索把每一对中英文名称当成同一个词，
 * 所以「Selected Papers Arts_Humanities」和「精选论文 Arts_Humanities」命中同一批书。
 * 按普通关键词走 GET /api/search?q=…，不另加隐藏 ?category=。
 * 首页 chips 只列顶层分类。「精选论文」用弹窗列出子类，不替换这一行。
 * 首页分类原先末尾有一枚文案 chip「其他 5万+」（英文 Other · 50,000+），已移除，不再展示。
 * http(s) 卡片显示点击次数：搜索结果与 /api/book 自带 clicks；首页另 GET /api/clicks?ids= 后按次数重排。
 * 点卡片或「下载」只打开弹窗，不 POST。弹窗里每种存储的「打开下载页」和「复制链接」各记 1 次点击。
 * POST /api/click 成功后，后台静默 GET /api/popular 与 GET /api/clicks，按与空搜索相同的规则
 * （popular + home.json 推荐书、按点击降序、最多 20）更新内存首页与 ebook-vault-home20-ranked。
 * 搜索框为空时无转圈、无清空闪烁地重排网格；框里有字只更新缓存，不替换搜索结果。
 * file:// 不请求 /api，也不显示次数，首页保持 home.json 推荐顺序。
 *
 * 顶栏 GitHub 图标旁有「论文」按钮，打开 selected-papers.html。首页不另插精选论文模块，
 * 「点击最多」仍是全库 popular + home.json。论文页只列精选论文，按 clicks 降序，每页 20。
 * 论文页不下载整份目录。首屏只取 data/papers/meta.json 和 page/0.json。
 * 加载更多取下一页。搜索只取查询用到的分片，再用与 /api/search 相同的词规则核对。
 * 次数优先用 /api/popular 里属于精选论文的记录，再对当前 20 本 GET /api/clicks。
 * 接口没有次数时仍按切片里的顺序（clicks 降序，同次数保持原顺序）。
 * 搜索匹配与首页相同，但只在精选论文内。筛选条直接展开学科，收录篇数写在标题下。
 *
 * 分片沿用长字段：title/title_zh/author/category/link/ext/size/size_text/
 * subcategory/tags/status/password/filename/uploaded_at/language，另加 id。
 * 页面内部仍用短字段：t zh l a c s e z f k u pw p。
 * l / language 是书本身的语言（ZH 中文 / EN 英文 / OTHER 其他），不是界面语言。
 * 搜索：整句 trim，按空白切词后再 trim，英文 toLocaleLowerCase('en') 后做子串匹配。
 * 每个词都要出现在书名、中文译名、作者、分类或子类里；标题内部空格保留。file:// 同样规则。
 */
(function () {
  "use strict";

  var PAGE_SIZE = 20;
  var HOME_LIMIT = 20;
  var SEARCH_LIMIT = 10;
  var PAPERS_CATEGORY = "精选论文";
  var PAPERS_PAGE = !!(document.body && document.body.classList.contains("papers-page"));
  var HOME_CACHE_KEY = "ebook-vault-home20-ranked";
  var HOME_CACHE_VERSION = 3;
  var CATEGORIES_CACHE_KEY = "ebook-vault-categories";
  var CATEGORIES_CACHE_VERSION = 4;
  var DEBOUNCE_MS = 350;
  var LANG_KEY = "ebook-vault-lang";
  var currentLang = "zh-CN";

  var STRINGS = {
    en: {
      docTitle: "Ebook Vault",
      metaDescription: "This site has completed search coverage of 100,000+ books, documents / papers. It does not store or distribute the files themselves.",
      brand: "Ebook Vault",
      brandShort: "Ebook Vault",
      brandSub: "",
      homeButton: "Home",
      mainNavAria: "Main navigation",
      githubHotHint: "GitHub Trending",
      searchableLine: "This site has completed search coverage of 100,000+ books, documents / papers.",
      searchableChip: "Categories",
      searchableHint: "Click to browse categories",
      homeLead: "Indexed 100,000+ books and 200,000+ selected papers",
      homeCategoryLabel: "Categories",
      homeCategoryAria: "Book categories",
      matchesLead: "",
      matchesTail: " matches",
      truncatedLead: "Showing first ",
      truncatedTail: "",
      skip: "Skip to books",
      searchPlaceholder: "Search title, author, or topic, e.g. Pride and Prejudice",
      searchAria: "Search title, author, category, tags, or filename",
      rootLink: "📥 Download full collection",
      filtersAria: "Filters",
      filtersTitle: "Filters",
      filtersOpen: "Filter",
      filtersDone: "Done",
      clearFilters: "Clear all",
      folderTitle: "Collections",
      folderHint: "Ctfile folders",
      categoryTitle: "Categories and counts of searched books, articles / papers.",
      categoryBack: "Back",
      multiHint: "Multi-select",
      onlyDownloadable: "Downloadable only",
      contentAria: "Books",
      countLead: "",
      countMid: " books / ",
      countTail: " shown",
      countHomeLead: "",
      countHomeTail: " recommended",
      loading: "Loading…",
      searching: "Searching…",
      emptyTitle: "No matching books",
      emptyHint: "Try a shorter query.",
      emptyReset: "Clear search",
      fileSearchHint: "This local file page cannot run site search. Open the site over http to search.",
      emptyLibraryTitle: "No books to show right now",
      loadErrorTitle: "Couldn't load ebooks",
      loadErrorHint: "",
      loadErrorCount: "Couldn't load",
      retry: "Retry",
      loadMore: "Load more",
      loadMoreLeft: "Load more ({n} left)",
      footerNoticeLead: "If the content published on this site infringes your rights, ",
      footerContact: "contact us",
      footerNoticeTail: ". We will handle it promptly!",
      footerCrawler: "The content above is automatically collected by a web crawler and generated without human intervention. Ebook Vault does not store, copy, or distribute any files.",
      toTop: "Back to top",
      langAria: "Language",
      themeToDark: "Switch to dark mode",
      themeToLight: "Switch to light mode",
      folderLinkTitle: "Open the “{name}” folder and download every book in this category",
      folderBadge: "📥 All",
      ariaDownload: "Open download: ",
      ariaCollection: "Open collection: ",
      untitled: "Untitled",
      unknownAuthor: "Unknown",
      pending: "Pending",
      download: "Download",
      quarkDownload: "Quark",
      quarkTitle: "Open Quark Drive link",
      modalTitle: "Download links",
      modalSubtitle: "Pick a download page",
      modalCtfile: "Ctfile",
      modalQuark: "Quark Drive",
      modalOpen: "Open page",
      modalCopy: "Copy link",
      modalCode: "Code: {code}",
      modalClose: "Close",
      modalNoLink: "No download link yet",
      modalFolder: "Category bundle",
      downloadCollection: "Bundle",
      copyLink: "Copy link",
      copied: "✅ Copied",
      linkCopied: "✅ Download link copied",
      linkCopiedCode: "✅ Download link copied (code included)",
      copyFailed: "❌ Couldn’t copy. Open the link manually.",
      codeCopiedBtn: "✅ Code copied",
      codeBtn: "🔑 Code {code}",
      codeCopiedToast: "✅ Code {code} copied",
      codeCopyFailed: "❌ Couldn’t copy. Enter the code manually.",
      codeTitle: "Code: {code}",
      collectionTitle: "Open this category’s shared folder",
      badgeCollection: "Collection",
      langZh: "Chinese",
      langEn: "English",
      langOther: "Other",
      clicksTimes: "{n} clicks",
      homeRankTitle: "Most clicked",
      otherRemainderCount: "50,000+",
      booksButton: "Books",
      helpButton: "Help",
      papersButton: "Papers",
      softwareButton: "Mac Software",
      openSourceButton: "Open Source",
      pickedTitle: "Selected Papers",
      pickedMore: "More",
      papersIncludedLead: "",
      papersIncludedTail: " total",
      papersCountGap: "  ",
      papersCountLead: "",
      papersCountTail: " total",
      papersYear: "Year",
      papersYearAll: "All",
      papersSortNote: "Sorted by clicks",
      papersCategory: "Category",
      papersSubject: "Subject",
      papersLanguage: "Language",
      papersLangAll: "All",
      papersClear: "Clear filters",
      papersSearchPlaceholder: "Search selected papers by title or subject",
      papersSearchAria: "Search selected papers by title, author, or subject",
      papersMatchesLead: "",
      papersMatchesTail: " papers",
      papersEmptyHint: "Try another subject, or a shorter query.",
      papersPrev: "Previous",
      papersNext: "Next",
      papersPageInfo: "Page {page} of {pages}"
    },
    "zh-CN": {
      docTitle: "书海拾贝",
      metaDescription: "本站已完成 10万+ 本各类书籍文档 / 论文的搜索任务。不存储、不传播文件本身。",
      brand: "书海拾贝",
      brandShort: "书海拾贝",
      brandSub: "",
      homeButton: "首页",
      mainNavAria: "主导航",
      searchableLine: "本站已完成 10万+ 各类书籍文档 / 论文的搜索任务",
      searchableChip: "分类",
      searchableHint: "点击查看分类",
      homeLead: "已完成 10万+ 各类书籍搜索，收录近 20万 精选论文",
      homeCategoryLabel: "分类",
      homeCategoryAria: "书籍分类",
      matchesLead: "找到 ",
      matchesTail: " 本",
      truncatedLead: "已筛选前 ",
      truncatedTail: " 本",
      skip: "跳到书籍列表",
      searchPlaceholder: "搜索书名、作者或分类，例如「傲慢与偏见」",
      searchAria: "搜索书名、作者、分类、标签、文件名",
      rootLink: "📥 整库合集下载",
      filtersAria: "筛选条件",
      filtersTitle: "筛选",
      filtersOpen: "筛选",
      filtersDone: "完成",
      clearFilters: "清空全部",
      folderTitle: "合集下载",
      folderHint: "城通文件夹",
      categoryTitle: "搜索过的书籍文章 / 论文分类以及数量",
      categoryBack: "返回",
      multiHint: "可多选",
      onlyDownloadable: "仅显示可下载",
      contentAria: "书籍列表",
      countLead: "共 ",
      countMid: " 本 / 已筛选 ",
      countTail: " 本",
      countHomeLead: "推荐 ",
      countHomeTail: " 本",
      loading: "正在加载书籍数据…",
      searching: "搜索中…",
      emptyTitle: "没有找到相关结果",
      emptyHint: "试试更短的关键词。",
      emptyReset: "清空搜索",
      fileSearchHint: "本地文件打开时无法搜索整库，请通过网站访问后再搜索。",
      emptyLibraryTitle: "暂时没有可展示的书",
      loadErrorTitle: "书籍数据加载失败",
      loadErrorHint: "",
      loadErrorCount: "加载失败",
      retry: "重试",
      loadMore: "加载更多",
      loadMoreLeft: "加载更多（还有 {n} 本）",
      footerNoticeLead: "本站发布的内容若侵犯到您的权益，",
      footerContact: "请联系我们",
      footerNoticeTail: "，我们将及时处理！",
      footerCrawler: "以上内容由网络爬虫自动抓取，以非人工方式自动生成。书海拾贝不储存、复制、传播任何文件。",
      toTop: "回到顶部",
      langAria: "语言",
      themeToDark: "切换到深色模式",
      themeToLight: "切换到浅色模式",
      folderLinkTitle: "打开「{name}」分类文件夹，批量下载该分类所有电子书",
      folderBadge: "📥 合集",
      ariaDownload: "打开下载：",
      ariaCollection: "打开分类合集下载：",
      untitled: "未命名",
      unknownAuthor: "佚名",
      pending: "待上传",
      download: "下载",
      quarkDownload: "夸克",
      quarkTitle: "打开夸克网盘链接",
      modalTitle: "下载链接",
      modalSubtitle: "选择要打开的下载页面",
      modalCtfile: "城通网盘",
      modalQuark: "夸克网盘",
      modalOpen: "打开下载页",
      modalCopy: "复制链接",
      modalCode: "提取码：{code}",
      modalClose: "关闭",
      modalNoLink: "暂无下载链接",
      modalFolder: "分类合集",
      downloadCollection: "📥 下载合集",
      copyLink: "📋 复制链接",
      copied: "✅ 已复制",
      linkCopied: "✅ 下载链接已复制",
      linkCopiedCode: "✅ 下载链接已复制（链接内已含提取码）",
      copyFailed: "❌ 复制失败，请手动打开链接",
      codeCopiedBtn: "✅ 已复制提取码",
      codeBtn: "🔑 提取码 {code}",
      codeCopiedToast: "✅ 提取码 {code} 已复制",
      codeCopyFailed: "❌ 复制失败，请手动输入提取码",
      codeTitle: "提取码：{code}",
      collectionTitle: "打开所属分类的城通文件夹分享链接",
      badgeCollection: "分类合集",
      langZh: "中文",
      langEn: "英文",
      langOther: "其他",
      clicksTimes: "{n} 次",
      homeRankTitle: "点击最多",
      otherRemainderCount: "5万+",
      githubHotHint: "GitHub 热门开源",
      booksButton: "书籍",
      helpButton: "帮助",
      papersButton: "论文",
      softwareButton: "Mac 软件",
      openSourceButton: "开源软件",
      pickedTitle: "精选论文",
      pickedMore: "更多",
      papersIncludedLead: "共",
      papersIncludedTail: " 篇",
      papersCountGap: "  ",
      papersCountLead: "共",
      papersCountTail: " 篇",
      papersYear: "年份",
      papersYearAll: "全部",
      papersSortNote: "按点击次数",
      papersCategory: "分类",
      papersSubject: "学科",
      papersLanguage: "语言",
      papersLangAll: "全部",
      papersClear: "清空筛选",
      papersSearchPlaceholder: "搜索精选论文的标题或学科",
      papersSearchAria: "搜索精选论文的标题、作者或学科",
      papersMatchesLead: "找到 ",
      papersMatchesTail: " 篇",
      papersEmptyHint: "试试其他学科，或更短的关键词。",
      papersPrev: "上一页",
      papersNext: "下一页",
      papersPageInfo: "第 {page} / {pages} 页"
    }
  };

  var CATEGORY_LABELS = {
    "编程开发": "Programming",
    "统计与数据科学": "Statistics",
    "教材教辅": "Textbooks",
    "历史与社会": "History & Society",
    "人文社科": "Humanities",
    "中国古典文学": "Chinese Classics",
    "中国现当代文学": "Modern Chinese Literature",
    "世界文学": "World Literature",
    "世界文学·小说": "World Fiction",
    "世界文学·诗歌": "World Poetry",
    "世界文学·戏剧": "World Drama",
    "世界文学·散文": "World Essays",
    "世界文学·儿童": "World Children's",
    "世界文学·传记": "World Biography",
    "世界文学·历史": "World History",
    "世界文学·科普": "World Popular Science",
    "世界文学·人文": "World Humanities",
    "诗歌散文": "Poetry & Essays",
    "文学阅读": "Literature",
    "悬疑推理": "Mystery & Crime",
    "科幻奇幻": "Sci-Fi & Fantasy",
    "经济管理": "Business & Economics",
    "心理励志": "Psychology & Self-Help",
    "科技科普": "Science & Technology",
    "传记纪实": "Biography & Memoir",
    "艺术生活": "Arts & Lifestyle",
    "生活健康": "Health & Living",
    "少儿教育": "Children & Education",
    "综合百科": "Reference",
    "诺贝尔奖": "Nobel Prize",
    "精选论文": "Selected Papers",
    "在线教程文档": "Online Docs",
    "出版合集": "Collections",
    "未分类": "Uncategorized",
    "其他": "Other"
  };

  // 子分类存在库里的原值不改，筛选仍按原值匹配。
  // 简体中文：只把英文原值（Books、Chemistry 等）换成中文，中文原值保持中文。
  // 英文界面：中文原值换成英文标签，英文原值保持原值。
  var SUBCATEGORY_LABELS = {
    "Books": "著作",
    "Chemistry": "化学",
    "Physics": "物理",
    "Medicine": "医学",
    "Economics": "经济学",
    "Literature": "文学",
    "Peace": "和平",
    "Computer_Science": "计算机科学",
    "Mathematics": "数学",
    "Arts_Humanities": "艺术与人文",
    "Biology": "生物学",
    "Engineering": "工程",
    "Social_Sciences": "社会科学",
    "Theses_Dissertations": "学位论文",
    "cs.AI": "人工智能",
    "cs.LG": "机器学习",
    "cs.CL": "计算语言学",
    "cs.CV": "计算机视觉",
    "cs.MA": "多智能体",
    "cs.NE": "神经与进化计算",
    "stat.ML": "统计机器学习",
    "cs.SE": "软件工程",
    "cs.HC": "人机交互",
    "cs.OS": "操作系统",
    "cs.PL": "编程语言"
  };

  function t(key) {
    var pack = STRINGS[currentLang] || STRINGS.en;
    if (pack && Object.prototype.hasOwnProperty.call(pack, key)) return pack[key];
    return STRINGS.en[key] || key;
  }

  function categoryLabel(key) {
    if (currentLang === "zh-CN") return key;
    return CATEGORY_LABELS[key] || key;
  }

  // 英文界面上仍会显示的中文标签。键是库里的原值。
  var SUBCATEGORY_EN = {
    "其他": "Other",
    "公版经典": "Public-domain classic",
    "中国历史": "Chinese History",
    "诸子": "Masters",
    "小学": "Primary School",
    "国学": "Chinese Learning",
    "诗词": "Shi and Ci",
    "初中": "Junior High",
    "高中": "Senior High",
    "易学": "Yijing Studies",
    "艺术": "Art",
    "AI与机器学习": "AI & Machine Learning",
    "漫画": "Comics",
    "五·四学制": "5–4 School System",
    "外国文学": "Foreign Literature",
    "人邮PDF": "PTPress PDFs",
    "职场": "Workplace",
    "二战": "World War II",
    "营销": "Marketing",
    "大学教材": "College Textbooks",
    "Web开发": "Web Development",
    "理财": "Personal Finance",
    "学习": "Learning",
    "股票": "Stocks",
    "爱情": "Love",
    "中国近现代史": "Modern Chinese History",
    "医学": "Medicine",
    "欧洲": "Europe",
    "心理学": "Psychology",
    "人物": "People",
    "沟通": "Communication",
    "女性": "Women",
    "后端": "Backend",
    "诗歌": "Poetry",
    "自我成长": "Personal Growth",
    "物理": "Physics",
    "科技": "Technology",
    "数据分析": "Data Analysis",
    "当代": "Contemporary",
    "世界历史": "World History",
    "外国": "Foreign",
    "大数据": "Big Data",
    "交易": "Trading",
    "犯罪": "Crime",
    "古典": "Classical",
    "健康": "Health",
    "经济学": "Economics",
    "思想": "Thought",
    "数学": "Mathematics",
    "侦探": "Detective",
    "自然": "Nature",
    "数据库": "Databases",
    "治愈": "Comfort",
    "近代史": "Early Modern History",
    "人工智能": "Artificial Intelligence",
    "晚清": "Late Qing",
    "野史": "Unofficial History",
    "游记": "Travelogues",
    "民国": "Republican China",
    "人类": "Humankind",
    "写作": "Writing",
    "安全": "Security",
    "企业": "Companies",
    "宇宙": "The Universe",
    "青春": "Youth",
    "人生": "Life",
    "美食": "Cuisine",
    "言情": "Romance Fiction",
    "操作系统与Linux": "Operating Systems & Linux",
    "武侠": "Wuxia",
    "心灵": "Mind & Spirit",
    "生物": "Life Sciences",
    "动物": "Animals",
    "罗马": "Rome",
    "三国": "Three Kingdoms",
    "JavaScript与前端": "JavaScript & Frontend",
    "博物馆": "Museums",
    "明朝": "Ming Dynasty",
    "育儿": "Child Rearing",
    "宗教": "Religion",
    "恐怖": "Horror",
    "天文": "Astronomy",
    "C与C++": "C & C++",
    "情绪": "Emotions",
    "现代": "Modern",
    "玄幻": "Xuanhuan",
    "数学习题": "Math Exercises",
    "算法与数据结构": "Algorithms & Data Structures",
    "货币": "Money",
    "清史": "Qing History",
    "网络与协议": "Networks & Protocols",
    "编程": "Programming",
    "绘画": "Painting",
    "魔幻": "Magical Fantasy",
    "设计模式与代码质量": "Design Patterns & Code Quality",
    "世界史": "World History",
    "大学": "College",
    "惊悚": "Thriller",
    "口才": "Speaking",
    "巴菲特": "Buffett",
    "电影": "Film",
    "法医": "Forensics",
    "广告": "Advertising",
    "回忆录": "Memoirs",
    "健身": "Fitness",
    "成功": "Success",
    "方法": "Methods",
    "古希腊": "Ancient Greece",
    "鸡汤": "Inspirational",
    "经管": "Business Management",
    "明史": "Ming History",
    "情商": "Emotional Intelligence",
    "摄影": "Photography",
    "生命": "Life Science",
    "意大利": "Italy",
    "佛学": "Buddhist Studies",
    "间谍": "Espionage",
    "社会学人类学": "Sociology & Anthropology",
    "苏联": "Soviet Union",
    "文明": "Civilization",
    "印度": "India",
    "中世纪": "Middle Ages",
    "古代": "Ancient",
    "决策": "Decision Making",
    "领导力": "Leadership",
    "欧洲史": "European History",
    "社交": "Social Skills",
    "思考": "Thinking",
    "地理": "Geography",
    "工作": "Work",
    "基因": "Genes",
    "人格": "Personality",
    "神话": "Mythology",
    "唐朝": "Tang Dynasty",
    "以色列": "Israel",
    "云计算与DevOps": "Cloud & DevOps",
    "财富": "Wealth",
    "操作系统": "Operating Systems",
    "城市": "Cities",
    "绘本": "Picture Books",
    "基金": "Funds",
    "技术": "Technical",
    "家庭": "Family",
    "灵异": "Supernatural",
    "旅行": "Travel",
    "清朝": "Qing Dynasty",
    "情感": "Feelings",
    "认知": "Cognition",
    "探险，艺术": "Exploration & Art",
    "植物": "Plants",
    "保健": "Health Care",
    "博弈": "Strategy",
    "谍战": "Spy Fiction",
    "官场": "Officialdom",
    "汉朝": "Han Dynasty",
    "红楼梦": "Dream of the Red Chamber",
    "华为": "Huawei",
    "建筑": "Architecture",
    "焦虑": "Anxiety",
    "人性": "Human Nature",
    "生活实用": "Practical Living",
    "数据": "Data",
    "文案": "Copywriting",
    "战国": "Warring States",
    "中国文学": "Chinese Literature",
    "并行计算": "Parallel Computing",
    "海洋": "Oceans",
    "记忆": "Memory",
    "进化": "Evolution",
    "经营": "Management",
    "科普": "Popular Science",
    "冷战": "Cold War",
    "两性": "Men & Women",
    "秦汉": "Qin & Han",
    "社会学": "Sociology",
    "思想史": "Intellectual History",
    "唐诗": "Tang Poetry",
    "未来": "The Future",
    "文革": "Cultural Revolution",
    "希腊": "Greece",
    "音乐": "Music",
    "自传": "Autobiography",
    "Swift与iOS": "Swift & iOS",
    "定位": "Positioning",
    "读书": "Books & Reading",
    "古罗马": "Ancient Rome",
    "故宫": "Forbidden City",
    "抗战": "War of Resistance",
    "考古": "Archaeology",
    "零售": "Retail",
    "猫": "Cats",
    "区块链": "Blockchain",
    "诗集": "Poetry Collections",
    "文物": "Cultural Relics",
    "西班牙": "Spain",
    "习惯": "Habits",
    "先秦": "Pre-Qin",
    "销售": "Sales",
    "新经济": "New Economy",
    "新媒体": "New Media",
    "性格": "Character",
    "语言": "Language",
    "阿拉伯": "Arabia",
    "北洋": "Beiyang",
    "财经": "Finance",
    "财务": "Corporate Finance",
    "大脑": "The Brain",
    "读客": "Duoke",
    "短篇": "Short Stories",
    "古籍": "Ancient Books",
    "海盗": "Pirates",
    "环境": "Environment",
    "会计": "Accounting",
    "婚姻": "Marriage",
    "领导": "Leaders",
    "贸易": "Trade",
    "脑科学": "Neuroscience",
    "品牌": "Brands",
    "亲子": "Parent & Child",
    "史学": "Historiography",
    "宋词": "Song Ci",
    "宋史": "Song History",
    "太平天国": "Taiping Rebellion",
    "魏晋": "Wei & Jin",
    "刑侦": "Criminal Investigation",
    "亚洲": "Asia",
    "演讲": "Public Speaking",
    "饮食": "Diet",
    "中医": "Chinese Medicine",
    "资本": "Capital",
    "Docker与容器": "Docker & Containers",
    "Go语言": "Go",
    "保险": "Insurance",
    "盗墓": "Tomb Raiding",
    "法律": "Law",
    "房地产": "Real Estate",
    "非洲": "Africa",
    "佛教": "Buddhism",
    "改革": "Reform",
    "谷歌": "Google",
    "股市": "Stock Market",
    "硅谷": "Silicon Valley",
    "架构与微服务": "Architecture & Microservices",
    "近代": "Early Modern",
    "咖啡": "Coffee",
    "拉美": "Latin America",
    "伦理": "Ethics",
    "莎士比亚": "Shakespeare",
    "宋朝": "Song Dynasty",
    "太空": "Space",
    "童话": "Fairy Tales",
    "土耳其": "Turkey",
    "一战": "World War I",
    "医疗": "Healthcare",
    "游戏": "Games",
    "哲学与思想": "Philosophy & Thought",
    "正能量": "Positivity",
    "穿越": "Time Travel",
    "春秋": "Spring and Autumn",
    "帝国": "Empire",
    "敦煌": "Dunhuang",
    "法学": "Jurisprudence",
    "革命": "Revolution",
    "股权": "Equity",
    "故事": "Stories",
    "户外": "Outdoors",
    "画册": "Art Books",
    "剧本": "Scripts",
    "美术": "Fine Arts",
    "美学": "Aesthetics",
    "民族": "Peoples",
    "拿破仑": "Napoleon",
    "南北朝": "Northern & Southern Dynasties",
    "暖心": "Heartwarming",
    "期货": "Futures",
    "乔布斯": "Steve Jobs",
    "秦汉史": "Qin & Han History",
    "权谋": "Stratagems",
    "瑞典": "Sweden",
    "设计": "Design",
    "神怪": "Gods & Spirits",
    "时尚": "Fashion",
    "私募": "Private Equity",
    "四大名著": "Four Great Classics",
    "隋唐史": "Sui & Tang History",
    "统计": "Statistics",
    "外交": "Diplomacy",
    "文集": "Collected Essays",
    "效率": "Productivity",
    "校园": "Campus",
    "心学": "School of Mind",
    "刑法": "Criminal Law",
    "修行": "Self-Cultivation",
    "亚马逊": "Amazon",
    "银行": "Banking",
    "中东": "Middle East",
    "种族": "Race",
    "阿富汗": "Afghanistan",
    "阿根廷": "Argentina",
    "埃及": "Egypt",
    "拜占庭": "Byzantium",
    "曾国藩": "Zeng Guofan",
    "产品": "Product",
    "朝鲜": "Korea",
    "传播": "Media",
    "大清": "Great Qing",
    "丹麦": "Denmark",
    "党史": "Party History",
    "道家": "Daoism",
    "电竞": "Esports",
    "东野圭吾": "Higashino",
    "动漫": "Anime",
    "读物": "Readers",
    "梵高": "Van Gogh",
    "感人": "Moving",
    "估值": "Valuation",
    "规划": "Planning",
    "海军": "Navy",
    "韩国": "South Korea",
    "荷兰": "Netherlands",
    "机器人": "Robotics",
    "技巧": "Technique",
    "绩效": "Performance",
    "减肥": "Weight Loss",
    "解密": "Codebreaking",
    "量子": "Quantum",
    "毛姆": "Maugham",
    "民俗": "Folklore",
    "明清史": "Ming & Qing History",
    "挪威": "Norway",
    "啤酒": "Beer",
    "秦朝": "Qin Dynasty",
    "人类学": "Anthropology",
    "人体": "Human Body",
    "三体": "Three-Body",
    "社科": "Social Sciences",
    "生物学": "Biology",
    "诗经": "Classic of Poetry",
    "石黑一雄": "Ishiguro",
    "苏格兰": "Scotland",
    "投机": "Speculation",
    "团队": "Teams",
    "文化史": "Cultural History",
    "小米": "Xiaomi",
    "小说文学": "Fiction",
    "新闻": "News",
    "信息": "Information",
    "星巴克": "Starbucks",
    "犹太": "Jewish",
    "阅读": "Reading",
    "政治学": "Political Science",
    "自我": "Self",
    "罪案": "Crime Cases",
    "Git与工具": "Git & Tools",
    "Web前端": "Web Frontend",
    "癌症": "Cancer",
    "澳大利亚": "Australia",
    "笔记": "Notes",
    "边疆": "Frontiers",
    "病毒": "Viruses",
    "博弈论": "Game Theory",
    "财商": "Financial Literacy",
    "产业": "Industry",
    "厨房": "Kitchen",
    "词话": "Ci Criticism",
    "慈禧": "Cixi",
    "大汉": "Great Han",
    "大航海": "Age of Discovery",
    "电子商务": "E-commerce",
    "抖音": "Douyin",
    "俄国史": "Russian History",
    "二战史": "WWII History",
    "法国大革命": "French Revolution",
    "方言": "Dialects",
    "访谈": "Interviews",
    "芬兰": "Finland",
    "服饰": "Clothing",
    "复盘": "Review",
    "概率": "Probability",
    "高盛": "Goldman Sachs",
    "格局": "Perspective",
    "宫斗": "Palace Intrigue",
    "古代史": "Ancient History",
    "古典文学": "Classical Literature",
    "古言": "Historical Romance",
    "怪谈": "Strange Tales",
    "海尔": "Haier",
    "航天": "Spaceflight",
    "后宫": "Imperial Harem",
    "化学": "Chemistry",
    "环保": "Conservation",
    "激励": "Motivation",
    "加拿大": "Canada",
    "教学": "Teaching",
    "抗日战争": "Anti-Japanese War",
    "孔子": "Confucius",
    "昆虫": "Insects",
    "李鸿章": "Li Hongzhang",
    "灵修": "Spirituality",
    "留学": "Study Abroad",
    "鲁迅": "Lu Xun",
    "旅游": "Tourism",
    "马拉松": "Marathon",
    "买房": "Home Buying",
    "麦肯锡": "McKinsey",
    "漫威": "Marvel",
    "美国史": "American History",
    "美联储": "Federal Reserve",
    "蒙元史": "Mongol Yuan History",
    "面试与求职": "Interviews & Jobs",
    "冥想": "Meditation",
    "能力": "Ability",
    "女生": "Girls",
    "跑步": "Running",
    "烹饪": "Cooking",
    "彭德怀": "Peng Dehuai",
    "普京": "Putin",
    "期权": "Options",
    "前端": "Frontend",
    "前端开发": "Frontend Development",
    "求职": "Job Hunting",
    "全球化": "Globalization",
    "人力": "Human Resources",
    "日本文学": "Japanese Literature",
    "儒家": "Confucianism",
    "儒学": "Confucian Learning",
    "十字军": "Crusades",
    "石油": "Oil",
    "时间": "Time",
    "史料": "Historical Sources",
    "收藏": "Collecting",
    "手绘": "Hand Drawing",
    "书法": "Calligraphy",
    "书信": "Letters",
    "睡眠": "Sleep",
    "斯大林": "Stalin",
    "四书": "Four Books",
    "宋代": "Song Era",
    "算法": "Algorithms",
    "隋唐": "Sui & Tang",
    "泰国": "Thailand",
    "谈判": "Negotiation",
    "唐代": "Tang Era",
    "腾讯": "Tencent",
    "推理悬疑": "Mystery",
    "晚明": "Late Ming",
    "网络小说": "Web Novels",
    "瘟疫": "Plague",
    "文献学": "Philology",
    "文艺": "Arts & Letters",
    "物理学": "Physics",
    "物流": "Logistics",
    "吸血鬼": "Vampires",
    "西游记": "Journey to the West",
    "希特勒": "Hitler",
    "戏剧": "Drama",
    "系统": "Systems",
    "仙侠": "Xianxia",
    "先秦史": "Pre-Qin History",
    "宪法": "Constitution",
    "心智": "Mindset",
    "芯片": "Chips",
    "幸福": "Happiness",
    "性学": "Sexology",
    "匈牙利": "Hungary",
    "学习方法": "Study Methods",
    "阴谋": "Conspiracy",
    "影评": "Film Reviews",
    "语文": "Chinese Language Arts",
    "越南": "Vietnam",
    "债券": "Bonds",
    "正念": "Mindfulness",
    "证券": "Securities",
    "职业": "Careers",
    "中国史": "History of China",
    "注意力": "Attention",
    "组织": "Organizations",
    "WEB开发": "Web Development",
    "阿里巴巴": "Alibaba",
    "埃博拉": "Ebola",
    "爱迪生": "Edison",
    "爱尔兰": "Ireland",
    "奥地利": "Austria",
    "巴尔干": "Balkans",
    "巴西": "Brazil",
    "编程语言": "Programming Languages",
    "编剧": "Screenwriting",
    "蝙蝠侠": "Batman",
    "兵器": "Weapons",
    "并购": "Mergers & Acquisitions",
    "波兰": "Poland",
    "测试": "Testing",
    "茶": "Tea",
    "禅": "Zen",
    "朝鲜战争": "Korean War",
    "成功学": "Success Studies",
    "成吉思汗": "Genghis Khan",
    "穿搭": "Style",
    "传媒": "Mass Media",
    "创投": "Venture Capital",
    "词集": "Ci Collections",
    "达芬奇": "da Vinci",
    "大自然": "The Natural World",
    "盗墓笔记": "The Grave Robbers' Chronicles",
    "道德经": "Tao Te Ching",
    "地球": "Earth",
    "迪士尼": "Disney",
    "第一次世界大战": "World War I",
    "第一次世界大战回忆录": "World War I Memoirs",
    "电商": "E-commerce",
    "短视频": "Short Video",
    "俄国": "Russia",
    "非虚构": "Nonfiction",
    "福尔摩斯": "Holmes",
    "复杂性": "Complexity",
    "高性价比人生指南.pdf": "High-Value Life Guide",
    "歌赋": "Songs & Fu",
    "狗": "Dogs",
    "鬼怪": "Ghosts",
    "国家": "The State",
    "海明威": "Hemingway",
    "海洋史": "Maritime History",
    "汉语": "Chinese Language",
    "汉字": "Chinese Characters",
    "护肤": "Skincare",
    "火星": "Mars",
    "霍金": "Hawking",
    "鸡尾酒": "Cocktails",
    "基督教": "Christianity",
    "技术分析": "Technical Analysis",
    "加缪": "Camus",
    "家庭教育": "Family Education",
    "甲午战争": "First Sino-Japanese War",
    "江湖": "Jianghu",
    "蒋介石": "Chiang Kai-shek",
    "教材": "Textbooks",
    "近视": "Myopia",
    "京剧": "Peking Opera",
    "经济史": "Economic History",
    "精进": "Self-Improvement",
    "军事谋略": "Military Strategy",
    "烤箱": "Ovens",
    "科幻奇幻": "Sci-Fi & Fantasy",
    "科学家": "Scientists",
    "可口可乐": "Coca-Cola",
    "课程": "Courses",
    "肯尼迪": "Kennedy",
    "拉丁美洲": "Latin America",
    "李白": "Li Bai",
    "李小龙": "Bruce Lee",
    "梁启超": "Liang Qichao",
    "粮食、油脂及植物蛋白工程": "Grain, Oil & Plant Protein",
    "疗愈": "Healing",
    "聊斋": "Liaozhai",
    "伦理学": "Moral Philosophy",
    "论语": "The Analects",
    "罗马史": "Roman History",
    "马云": "Jack Ma",
    "曼德拉": "Mandela",
    "贸易战": "Trade War",
    "美术史": "Art History",
    "魔兽": "Warcraft",
    "谋略": "Tactics",
    "能源": "Energy",
    "女权主义": "Feminism",
    "破案": "Case Solving",
    "葡萄酒": "Wine",
    "葡萄牙": "Portugal",
    "企业家": "Entrepreneurs",
    "亲密关系": "Intimate Relationships",
    "秦始皇": "Qin Shi Huang",
    "全球史": "Global History",
    "人情": "Human Relations",
    "三国演义": "Romance of the Three Kingdoms",
    "商务": "Business",
    "上市": "IPOs",
    "圣经": "The Bible",
    "史书": "Historical Records",
    "世界杯": "World Cup",
    "世界是": "The World Is",
    "视频": "Video",
    "收纳": "Decluttering",
    "数理": "Math & Physics",
    "丝绸之路": "Silk Road",
    "苏轼": "Su Shi",
    "特朗普": "Trump",
    "同性": "LGBTQ",
    "王小波": "Wang Xiaobo",
    "网络时代": "Internet Age",
    "威士忌": "Whiskey",
    "温情": "Tenderness",
    "文化常识": "Cultural Literacy",
    "文化大革命": "Cultural Revolution",
    "文明史": "History of Civilization",
    "武器": "Arms",
    "现代文学": "Modern Literature",
    "相对论": "Relativity",
    "香港随笔": "Hong Kong Essays",
    "新零售": "New Retail",
    "悬爱": "Romantic Suspense",
    "学术": "Scholarship",
    "亚瑟王": "King Arthur",
    "养生": "Wellness",
    "妖怪": "Monsters",
    "伊朗": "Iran",
    "艺术文化": "Arts & Culture",
    "英格兰": "England",
    "英语读物": "English Readers",
    "影视": "Film & TV",
    "用户": "Users",
    "犹太人": "Jews",
    "运动": "Sports",
    "蒸汽朋克": "Steampunk",
    "整理": "Organizing",
    "正则表达式": "Regular Expressions",
    "直销": "Direct Sales",
    "志怪": "Zhiguai",
    "治愈系": "Feel-Good",
    "中医学": "Chinese Medical Studies",
    "朱元璋": "Zhu Yuanzhang",
    "诸葛亮": "Zhuge Liang",
    "资本论": "Das Kapital",
    "自控力": "Self-Control",
    "自律": "Self-Discipline",
    "自然科学": "Natural Science",
    "华尔街": "Wall Street",
    "小说": "Novel",
    "儿童文学": "Children's Literature",
    "科幻": "Sci-Fi",
    "人文与生活": "Humanities & Life",
    "历史": "History",
    "短篇小说": "Short Stories",
    "悬疑": "Mystery",
    "游记与地理": "Travel & Geography",
    "传记": "Biography",
    "战争与军事": "War & Military",
    "随笔": "Essays",
    "自然与博物": "Nature & Natural History",
    "奇幻": "Fantasy",
    "宗教与哲学": "Religion & Philosophy",
    "西部": "Western",
    "冒险": "Adventure",
    "历史小说": "Historical Fiction",
    "书信纪实": "Letters & Memoir",
    "科学与技术": "Science & Technology",
    "政治": "Politics",
    "民俗传说": "Folklore & Legends",
    "通俗小说": "Pulp Fiction",
    "航海": "Seafaring",
    "心理小说": "Psychological Fiction",
    "儿童": "Children",
    "人文": "Humanistic",
    "散文": "Prose",
  };

  // 书名与键完全一致时，英文界面用通行英译做标题，中文名做副标题。
  // 不匹配续书、注本，也不给没有通行英译的书名现编英文名。
  var TITLE_EN = {
    "红楼梦": "Dream of the Red Chamber",
    "西游记": "Journey to the West",
    "水浒传": "Water Margin",
    "三国演义": "Romance of the Three Kingdoms",
    "论语": "The Analects",
    "聊斋志异": "Strange Tales from a Chinese Studio",
    "围城": "Fortress Besieged",
    "楚辞": "The Songs of the South",
    "孟子": "Mencius",
    "老子": "Tao Te Ching",
    "中庸": "The Doctrine of the Mean",
    "唐诗三百首": "Three Hundred Tang Poems",
    "宋词三百首": "Three Hundred Song Ci Poems",
    "全唐诗": "Complete Tang Poems",
    "野草": "Wild Grass",
    "朝花夕拾": "Dawn Blossoms Plucked at Dusk",
    "儒林外史": "The Scholars",
    "金瓶梅": "The Plum in the Golden Vase",
    "西厢记": "The Story of the Western Wing",
    "牡丹亭": "The Peony Pavilion",
    "镜花缘": "Flowers in the Mirror",
    "封神演义": "Creation of the Gods",
    "世说新语": "A New Account of Tales of the World",
    "文心雕龙": "The Literary Mind and the Carving of Dragons",
    "山海经": "The Classic of Mountains and Seas",
    "老残游记": "The Travels of Lao Can",
    "文选": "Selections of Refined Literature",
    "窦娥冤": "The Injustice to Dou E",
    "别逗了，费曼先生": "Surely You're Joking, Mr. Feynman!",
    "人类简史：从动物到上帝": "Sapiens: A Brief History of Humankind",
    "给忙碌者的天体物理学": "Astrophysics for People in a Hurry",
    "寂静的春天（四师推荐精装版）": "Silent Spring",
    "基因传": "The Gene: An Intimate History",
    "生命是什么：活细胞的物理观": "What Is Life?",
    "生命是什么：40亿年生命史诗的开端": "What Is Life?: How Chemistry Becomes Biology",
    "枪炮、病菌与钢铁 : 人类社会的命运 (世纪人文系列丛书·开放人文)": "Guns, Germs, and Steel",
    "枪炮、病菌和钢铁": "Guns, Germs, and Steel",
    "枪炮、病菌与钢铁（修订版）": "Guns, Germs, and Steel",
    "几何原本": "Euclid's Elements",
    "梦溪笔谈": "Dream Pool Essays",
    "天工开物": "The Exploitation of the Works of Nature",
    "病毒星球": "A Planet of Viruses",
    "细胞生命的礼赞": "The Lives of a Cell",
    "未来简史": "Homo Deus: A Brief History of Tomorrow",
    "十问：霍金沉思录": "Brief Answers to the Big Questions",
    "数学之美": "The Beauty of Mathematics in Computer Science",
    "天演论": "Evolution and Ethics",
    "浪潮之巅": "On Top of Tides",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "鬼灭之刃（第一部：卷1卷7）": "Demon Slayer: Kimetsu no Yaiba (Part 1: Vols. 1-7)",
    "鬼灭之刃（第二部：卷8卷15）": "Demon Slayer: Kimetsu no Yaiba (Part 2: Vols. 8-15)",
    "鬼灭之刃（第三部：卷16卷23）": "Demon Slayer: Kimetsu no Yaiba (Part 3: Vols. 16-23)",
    "火影忍者（第1部：卷1~卷7）": "Naruto (Part 1: Vols. 1-7)",
    "火影忍者（第2部：卷8~卷14）": "Naruto (Part 2: Vols. 8-14)",
    "火影忍者（第3部：卷15~卷21）": "Naruto (Part 3: Vols. 15-21)",
    "火影忍者（第4部：卷22~卷27）": "Naruto (Part 4: Vols. 22-27)",
    "火影忍者（第5部：卷28~卷34）": "Naruto (Part 5: Vols. 28-34)",
    "火影忍者（第6部：卷35~卷41）": "Naruto (Part 6: Vols. 35-41)",
    "火影忍者（第7部：卷42~卷48）": "Naruto (Part 7: Vols. 42-48)",
    "火影忍者（第8部：卷49~卷56）": "Naruto (Part 8: Vols. 49-56)",
    "火影忍者（第9部：卷57~卷64）": "Naruto (Part 9: Vols. 57-64)",
    "火影忍者（第10部：卷65~卷72）": "Naruto (Part 10: Vols. 65-72)",
    "火影忍者（外传：宇智波莎罗娜）": "Naruto (Side Story: Sarada Uchiha)",
    "名侦探柯南（第1部：卷1~卷8）": "Detective Conan (Part 1: Vols. 1-8)",
    "名侦探柯南（第2部：卷9~卷16）": "Detective Conan (Part 2: Vols. 9-16)",
    "名侦探柯南（第3部：卷17~卷24）": "Detective Conan (Part 3: Vols. 17-24)",
    "名侦探柯南（第4部：卷25~卷32）": "Detective Conan (Part 4: Vols. 25-32)",
    "名侦探柯南（第5部：卷33~卷40）": "Detective Conan (Part 5: Vols. 33-40)",
    "名侦探柯南（第6部：卷41~卷48）": "Detective Conan (Part 6: Vols. 41-48)",
    "名侦探柯南（第7部：卷49~卷56）": "Detective Conan (Part 7: Vols. 49-56)",
    "名侦探柯南（第8部：卷57~卷64）": "Detective Conan (Part 8: Vols. 57-64)",
    "名侦探柯南（第9部：卷65~卷72）": "Detective Conan (Part 9: Vols. 65-72)",
    "名侦探柯南（第10部：卷73~卷80）": "Detective Conan (Part 10: Vols. 73-80)",
    "名侦探柯南（第11部：卷81~卷88）": "Detective Conan (Part 11: Vols. 81-88)",
    "名侦探柯南（第12部：卷89~卷95）": "Detective Conan (Part 12: Vols. 89-95)",
    "名侦探柯南（第13部：卷96~卷98）": "Detective Conan (Part 13: Vols. 96-98)",
    "乱马（第1部：卷1卷8）": "Ranma 1/2 (Part 1: Vols. 1-8)",
    "乱马（第2部：卷9卷16）": "Ranma 1/2 (Part 2: Vols. 9-16)",
    "乱马（第3部：卷17卷24）": "Ranma 1/2 (Part 3: Vols. 17-24)",
    "乱马（第4部：卷25卷32）": "Ranma 1/2 (Part 4: Vols. 25-32)",
    "乱马（第5部：卷33卷38）": "Ranma 1/2 (Part 5: Vols. 33-38)",
    "哆啦A梦珍藏版（第一部：卷1卷6）": "Doraemon Collector's Edition (Part 1: Vols. 1-6)",
    "哆啦A梦珍藏版（第二部：卷7卷12）": "Doraemon Collector's Edition (Part 2: Vols. 7-12)",
    "哆啦A梦珍藏版（第三部：卷13卷18）": "Doraemon Collector's Edition (Part 3: Vols. 13-18)",
    "哆啦A梦珍藏版（第四部：卷19卷24）": "Doraemon Collector's Edition (Part 4: Vols. 19-24)",
    "哆啦A梦珍藏版（第五部：卷25卷30）": "Doraemon Collector's Edition (Part 5: Vols. 25-30)",
    "哆啦A梦珍藏版（第六部：卷31卷36）": "Doraemon Collector's Edition (Part 6: Vols. 31-36)",
    "哆啦A梦珍藏版（第七部：卷37卷42）": "Doraemon Collector's Edition (Part 7: Vols. 37-42)",
    "哆啦A梦珍藏版（第八部：卷43卷45）": "Doraemon Collector's Edition (Part 8: Vols. 43-45)",
    "龙珠（17卷）": "Dragon Ball (Vols. 1-7)",
    "龙珠（814卷）": "Dragon Ball (Vols. 8-14)",
    "龙珠（1521卷）": "Dragon Ball (Vols. 15-21)",
    "龙珠（2228卷）": "Dragon Ball (Vols. 22-28)",
    "龙珠（2935卷）": "Dragon Ball (Vols. 29-35)",
    "龙珠（3642卷）": "Dragon Ball (Vols. 36-42)",
    "圣斗士星矢（第1部17卷）": "Saint Seiya (Part 1: Vols. 1-7)",
    "圣斗士星矢（第2部814卷）": "Saint Seiya (Part 2: Vols. 8-14)",
    "圣斗士星矢（第3部1521卷）": "Saint Seiya (Part 3: Vols. 15-21)",
    "圣斗士星矢（第4部2228卷）": "Saint Seiya (Part 4: Vols. 22-28)",
    "夏目友人帐（第1部16卷）": "Natsume's Book of Friends (Part 1: Vols. 1-6)",
    "夏目友人帐（第2部712卷）": "Natsume's Book of Friends (Part 2: Vols. 7-12)",
    "夏目友人帐（第3部1318卷）": "Natsume's Book of Friends (Part 3: Vols. 13-18)",
    "夏目友人帐（第4部1921卷）": "Natsume's Book of Friends (Part 4: Vols. 19-21)",
    "新蜡笔小新合集（套装共8册）": "New Crayon Shin-chan Collection (8 volumes)",
    "西游记漫画版全套（共20册）": "Journey to the West: Complete Comic Edition (20 volumes)",
    "水浒传漫画版全套（共20册）": "Water Margin: Complete Comic Edition (20 volumes)",
    "三国演义漫画版全套（共20册）": "Romance of the Three Kingdoms: Complete Comic Edition (20 volumes)",
    "红楼梦漫画版全套（共20册）": "Dream of the Red Chamber: Complete Comic Edition (20 volumes)",
    "武英殿本四库全书总目·上（130册）": "General Catalogue of the Complete Library of the Four Treasuries, Wuyingdian Edition, Part 1 (130 volumes)",
    "武英殿本四库全书总目·下（3160册）": "General Catalogue of the Complete Library of the Four Treasuries, Wuyingdian Edition, Part 2 (3160 volumes)",
    "牛津艺术史系列": "Oxford History of Art, Series 1",
    "史记": "Records of the Grand Historian",
    "资治通鉴": "Comprehensive Mirror to Aid in Government",
    "司马光：资治通鉴": "Comprehensive Mirror to Aid in Government",
    "续资治通鉴": "Continuation of the Comprehensive Mirror to Aid in Government",
    "孙子兵法": "The Art of War",
    "孙膑兵法": "Sun Bin: The Art of Warfare",
    "六韬": "The Six Secret Teachings",
    "韩非子": "Han Feizi",
    "荀子": "Xunzi",
    "墨子": "Mozi",
    "管子": "Guanzi",
    "列子": "Liezi",
    "吕氏春秋": "The Annals of Lü Buwei",
    "淮南子": "The Huainanzi",
    "商君书": "The Book of Lord Shang",
    "公孙龙子": "Gongsun Longzi",
    "战国策": "Intrigues of the Warring States",
    "尚书": "The Book of Documents",
    "礼记": "The Book of Rites",
    "周易": "The Book of Changes",
    "仪礼": "The Book of Etiquette and Ceremonial",
    "周礼": "Rites of Zhou",
    "尔雅": "The Erya",
    "三国志": "Records of the Three Kingdoms",
    "汉书": "The Book of Han",
    "后汉书": "The Book of the Later Han",
    "菜根谭": "Vegetable Roots Discourse",
    "搜神记": "In Search of the Supernatural",
    "子不语": "What the Master Would Not Discuss",
    "阅微草堂笔记": "Notes of the Yuewei Hermitage",
    "酉阳杂俎": "Miscellaneous Morsels from Youyang",
    "穆天子传": "The Tale of King Mu, Son of Heaven",
    "颜氏家训": "Family Instructions for the Yan Clan",
    "徐霞客游记": "The Travel Diaries of Xu Xiake",
    "水经注": "Commentary on the Water Classic",
    "全宋词": "Complete Song Ci Poems",
    "千家诗": "Poems of a Thousand Masters",
    "乐府诗集": "Collection of Yuefu Poems",
    "百家姓": "The Hundred Family Surnames",
    "千字文": "The Thousand Character Classic",
    "了凡四训": "Liao-Fan's Four Lessons",
    "坛经": "The Platform Sutra",
    "楞严经": "The Surangama Sutra",
    "太平经": "The Scripture of Great Peace",
    "周易参同契": "The Seal of the Unity of the Three",
    "抱朴子": "Baopuzi: The Master Who Embraces Simplicity",
    "长生殿": "The Palace of Eternal Life",
    "桃花扇": "The Peach Blossom Fan",
    "官场现形记": "Officialdom Unmasked",
    "二十年目睹之怪现状": "Bizarre Happenings Eyewitnessed over Two Decades",
    "孽海花": "A Flower in a Sinful Sea",
    "东周列国志": "Chronicles of the Eastern Zhou Kingdoms",
    "说岳全传": "The Story of Yue Fei",
    "隋唐演义": "Romance of the Sui and Tang Dynasties",
    "四世同堂": "Four Generations Under One Roof",
    "茶馆": "Teahouse",
    "故事新编": "Old Tales Retold",
    "呐喊彷徨故事新编": "Call to Arms, Wandering, and Old Tales Retold",
    "子夜": "Midnight",
    "林家铺子": "The Shop of the Lin Family",
    "月牙儿": "Crescent Moon",
    "湘行散记": "Recollections of West Hunan",
    "我们仨": "We Three",
    "撒哈拉的故事": "Stories of the Sahara",
    "白鹿原": "White Deer Plain",
    "废都": "Ruined City",
    "浮躁": "Turbulence",
    "秦腔": "Qin Opera",
    "繁花": "Blossoms",
    "一句顶一万句": "Someone to Talk To",
    "红岩": "Red Crag",
    "黄金时代": "The Golden Age",
    "平凡的世界（套装共3册）": "Ordinary World",
    "骆驼祥子（作家榜经典文库）": "Rickshaw Boy",
    "倾城之恋（2019版）": "Love in a Fallen City",
    "尘埃落定（十五周年纪念版）": "Red Poppies",
    "穆斯林的葬礼": "The Jade King",
    "万历十五年": "1587, a Year of No Significance",
    "叫魂": "Soulstealers",
    "三体全集": "The Three-Body Problem: The Complete Trilogy",
    "流浪地球": "The Wandering Earth",
    "球状闪电": "Ball Lightning",
    "超新星纪元": "Supernova Era",
    "孔飞力：叫魂——1768年中国妖术大恐慌": "Soulstealers: The Chinese Sorcery Scare of 1768",
    "德米安：埃米尔·辛克莱的彷徨少年时": "Demian: The Story of Emil Sinclair's Youth",
    "傲慢与偏见": "Pride and Prejudice",
    "战争与和平": "War and Peace",
    "安娜·卡列尼娜": "Anna Karenina",
    "复活": "Resurrection",
    "罪与罚": "Crime and Punishment",
    "卡拉马佐夫兄弟": "The Brothers Karamazov",
    "白夜": "White Nights",
    "百年孤独": "One Hundred Years of Solitude",
    "霍乱时期的爱情": "Love in the Time of Cholera",
    "族长的秋天": "The Autumn of the Patriarch",
    "活着为了讲述": "Living to Tell the Tale",
    "基督山伯爵": "The Count of Monte Cristo",
    "悲惨世界": "Les Misérables",
    "巴黎圣母院": "The Hunchback of Notre-Dame",
    "巴黎圣母院（作家榜经典文库）": "The Hunchback of Notre-Dame",
    "三个火枪手": "The Three Musketeers",
    "茶花女": "The Lady of the Camellias",
    "红与黑": "The Red and the Black",
    "包法利夫人": "Madame Bovary",
    "人间喜剧": "La Comédie Humaine",
    "羊脂球": "Boule de Suif",
    "漂亮朋友": "Bel-Ami",
    "简·爱": "Jane Eyre",
    "呼啸山庄": "Wuthering Heights",
    "双城记": "A Tale of Two Cities",
    "双城记（作家榜经典文库）": "A Tale of Two Cities",
    "雾都孤儿": "Oliver Twist",
    "远大前程（作家榜经典文库）": "Great Expectations",
    "大卫·科波菲尔": "David Copperfield",
    "老人与海": "The Old Man and the Sea",
    "永别了，武器": "A Farewell to Arms",
    "丧钟为谁而鸣": "For Whom the Bell Tolls",
    "乞力马扎罗的雪": "The Snows of Kilimanjaro",
    "了不起的盖茨比": "The Great Gatsby",
    "了不起的盖茨比（作家榜经典文库）": "The Great Gatsby",
    "夜色温柔": "Tender Is the Night",
    "麦田里的守望者": "The Catcher in the Rye",
    "愤怒的葡萄": "The Grapes of Wrath",
    "人鼠之间": "Of Mice and Men",
    "人鼠之间（约翰·斯坦贝克作品系列）": "Of Mice and Men",
    "罐头厂街": "Cannery Row",
    "汤姆·索亚历险记": "The Adventures of Tom Sawyer",
    "哈克贝利·费恩历险记": "Adventures of Huckleberry Finn",
    "白鲸": "Moby-Dick",
    "红字": "The Scarlet Letter",
    "动物农场": "Animal Farm",
    "动物庄园": "Animal Farm",
    "小王子": "The Little Prince",
    "小王子（作家榜经典文库）": "The Little Prince",
    "小王子（成为小王子系列）": "The Little Prince",
    "夜航（成为小王子系列）": "Night Flight",
    "人的大地（成为小王子系列）": "Wind, Sand and Stars",
    "南方邮航（成为小王子系列）": "Southern Mail",
    "月亮和六便士": "The Moon and Sixpence",
    "刀锋": "The Razor's Edge",
    "人生的枷锁": "Of Human Bondage",
    "面纱": "The Painted Veil",
    "寻欢作乐": "Cakes and Ale",
    "杀死一只知更鸟": "To Kill a Mockingbird",
    "追风筝的人": "The Kite Runner",
    "灿烂千阳": "A Thousand Splendid Suns",
    "群山回唱": "And the Mountains Echoed",
    "堂吉诃德": "Don Quixote",
    "堂吉诃德（作家榜经典文库）": "Don Quixote",
    "神曲": "The Divine Comedy",
    "城堡": "The Castle",
    "审判": "The Trial",
    "变形记（作家榜经典文库）": "The Metamorphosis",
    "鼠疫": "The Plague",
    "局外人": "The Stranger",
    "局外人（作家榜经典文库）": "The Stranger",
    "西西弗神话": "The Myth of Sisyphus",
    "堕落": "The Fall",
    "第一个人": "The First Man",
    "仲夏夜之梦（莎士比亚戏剧中文版）": "A Midsummer Night's Dream",
    "威尼斯商人（莎士比亚戏剧中文版）": "The Merchant of Venice",
    "麦克白（莎士比亚戏剧中文版）": "Macbeth",
    "李尔王（莎士比亚戏剧中文版）": "King Lear",
    "暴风雨（莎士比亚戏剧中文版）": "The Tempest",
    "盲眼钟表匠": "The Blind Watchmaker",
    "国富论": "The Wealth of Nations",
    "君主论": "The Prince",
    "理想国": "The Republic",
    "查拉图斯特拉如是说": "Thus Spoke Zarathustra",
    "梦的解析": "The Interpretation of Dreams",
    "爱的艺术": "The Art of Loving",
    "人类简史": "Sapiens: A Graphic History",
    "今日简史": "21 Lessons for the 21st Century",
    "人类群星闪耀时": "Decisive Moments in History",
    "神经漫游者": "Neuromancer",
    "海底两万里": "Twenty Thousand Leagues Under the Seas",
    "八十天环游地球": "Around the World in Eighty Days",
    "地心游记": "Journey to the Center of the Earth",
    "福尔摩斯探案集": "The Complete Sherlock Holmes",
    "少年维特之烦恼": "The Sorrows of Young Werther",
    "少年维特的烦恼": "The Sorrows of Young Werther",
    "浮士德": "Faust",
    "悉达多": "Siddhartha",
    "荒原狼": "Steppenwolf",
    "纳尔齐斯与歌尔德蒙": "Narcissus and Goldmund",
    "钢铁是怎样炼成的": "How the Steel Was Tempered",
    "静静的顿河": "And Quiet Flows the Don",
    "日瓦戈医生": "Doctor Zhivago",
    "大师与玛格丽特": "The Master and Margarita",
    "第二性": "The Second Sex",
    "存在与时间": "Being and Time",
    "就业、利息和货币通论": "The General Theory of Employment, Interest and Money",
    "新教伦理与资本主义精神": "The Protestant Ethic and the Spirit of Capitalism",
    "菊与刀": "The Chrysanthemum and the Sword",
    "菊与刀（增订版）": "The Chrysanthemum and the Sword",
    "零年：1945": "Year Zero: 1945",
    "创造日本：18531964": "Inventing Japan: 1853-1964",
    "日本之镜：日本文化中的英雄与恶人": "A Japanese Mirror: Heroes and Villains of Japanese Culture",
    "东京绮梦": "A Tokyo Romance",
    "罪孽的报应": "The Wages of Guilt",
    "想象的共同体（增订版）": "Imagined Communities",
    "随机漫步的傻瓜": "Fooled by Randomness",
    "思考，快与慢": "Thinking, Fast and Slow",
    "反脆弱：从不确定性中获益": "Antifragile",
    "众病之王：癌症传": "The Emperor of All Maladies",
    "不能承受的生命之轻": "The Unbearable Lightness of Being",
    "源氏物语": "The Tale of Genji",
    "平家物语": "The Tale of the Heike",
    "枕草子": "The Pillow Book",
    "罗生门": "Rashomon",
    "地狱变": "Hell Screen",
    "人间失格": "No Longer Human",
    "人间失格（作家榜经典文库）": "No Longer Human",
    "人间失格（太宰治作品精选集）": "No Longer Human",
    "斜阳（太宰治作品精选集）": "The Setting Sun",
    "女生徒": "Schoolgirl",
    "我是猫": "I Am a Cat",
    "草枕": "Kusamakura",
    "白夜行": "Journey Under the Midnight Sun",
    "嫌疑人X的献身": "The Devotion of Suspect X",
    "解忧杂货店": "The Miracles of the Namiya General Store",
    "恶意": "Malice",
    "新参者": "Newcomer",
    "圣女的救济": "Salvation of a Saint",
    "拉普拉斯的魔女": "Laplace's Witch",
    "魔戒": "The Lord of the Rings",
    "霍比特人": "The Hobbit",
    "霍比特人与魔戒三部曲": "The Hobbit and The Lord of the Rings",
    "哈利波特完整系列": "Harry Potter: The Complete Series",
    "沙丘六部曲": "Dune: The Six-Book Saga",
    "沙丘序曲三部曲": "Prelude to Dune",
    "银河帝国：基地七部曲": "Foundation: The Complete Seven-Book Series",
    "全球通史：1500年以前的世界": "A Global History: The World to 1500",
    "全球通史：1500年以后的世界": "A Global History: The World Since 1500",
    "全球通史：从史前到21世纪（第7版新校本）": "A Global History: From Prehistory to the 21st Century",
    "你一生的故事": "Stories of Your Life and Others",
    "直捣蜂窝的女孩": "The Girl Who Kicked the Hornet's Nest",
    "玩火的女孩": "The Girl Who Played with Fire",
    "皇帝魂": "The Emperor's Soul",
    "菜根谭（作家榜经典文库）": "Vegetable Roots Discourse",
    "红与黑（作家榜经典文库）": "The Red and the Black",
    "漫长的告别（作家榜经典文库）": "The Long Goodbye",
    "猎人笔记（作家榜经典文库）": "A Sportsman's Sketches",
    "道林格雷的画像（作家榜经典文库）": "The Picture of Dorian Gray",
    "隐身人（作家榜经典文库）": "The Invisible Man",
    "套中人（作家榜经典文库）": "The Man in a Case",
    "星际战争（作家榜经典文库）": "The War of the Worlds",
    "变色龙（作家榜经典文库）": "The Chameleon",
    "阴翳礼赞（作家榜经典文库）": "In Praise of Shadows",
    "金银岛（作家榜经典文库）": "Treasure Island",
    "钢铁是怎样炼成的（作家榜经典文库）": "How the Steel Was Tempered",
    "长眠不醒（作家榜经典文库）": "The Big Sleep",
    "莫罗博士岛（作家榜经典文库）": "The Island of Doctor Moreau",
    "孙子兵法青少版（作家榜经典文库）": "The Art of War",
    "名利场（作家榜经典文库）": "Vanity Fair",
    "磨坊信札（作家榜经典文库）": "Letters from My Mill",
    "月亮与六便士（作家榜经典文库）": "The Moon and Sixpence",
    "鲁滨逊漂流记（作家榜经典文库）": "Robinson Crusoe",
    "爱丽丝漫游奇境（作家榜经典文库）": "Alice's Adventures in Wonderland",
    "老人与海（作家榜经典文库）": "The Old Man and the Sea",
    "白鲸（作家榜经典文库）": "Moby-Dick",
    "白鲸（作家榜经典文库）2020版": "Moby-Dick",
    "高老头（作家榜经典文库）": "Père Goriot",
    "绿山墙的安妮（作家榜经典文库）": "Anne of Green Gables",
    "镜花缘（作家榜经典文库）": "Flowers in the Mirror",
    "老残游记（作家榜经典文库）": "The Travels of Lao Can",
    "尼尔斯骑鹅历险记（作家榜经典文库）": "The Wonderful Adventures of Nils",
    "枕草子（作家榜经典文库）": "The Pillow Book",
    "人生的智慧（作家榜经典文库）": "The Wisdom of Life",
    "乌合之众（作家榜经典文库）": "The Crowd",
    "一间自己的房间（作家榜经典文库）": "A Room of One's Own",
    "格列佛游记（作家榜经典文库）": "Gulliver's Travels",
    "在路上（作家榜经典文库）": "On the Road",
    "神曲（作家榜经典文库）": "The Divine Comedy",
    "时间机器（作家榜经典文库）": "The Time Machine",
    "罪与罚（作家榜经典文库）": "Crime and Punishment",
    "都柏林人（作家榜经典文库）": "Dubliners",
    "培根随笔全集（作家榜经典文库）": "Bacon's Essays",
    "达摩流浪者（作家榜经典文库）": "The Dharma Bums",
    "春潮（作家榜经典文库）": "Torrents of Spring",
    "初恋（作家榜经典文库）": "First Love",
    "封神演义（作家榜经典文库）": "Creation of the Gods",
    "唐诗三百首（作家榜经典文库）": "Three Hundred Tang Poems",
    "宋词三百首（作家榜经典文库）": "Three Hundred Song Ci Poems",
    "人性的弱点（作家榜经典文库）": "How to Win Friends and Influence People",
    "约翰·克里斯朵夫（作家榜经典文库）": "Jean-Christophe",
    "银河铁道之夜（作家榜经典文库）": "Night on the Galactic Railroad",
    "第十二夜（莎士比亚戏剧中文版）": "Twelfth Night",
    "奥瑟罗（莎士比亚戏剧中文版）": "Othello",
    "皆大欢喜（莎士比亚戏剧中文版）": "As You Like It",
    "哈姆莱特（莎士比亚戏剧中文版）": "Hamlet",
    "茶馆（作家榜经典文库）": "Teahouse",
    "潘多拉之匣（太宰治作品精选集）": "Pandora's Box",
    "伤心咖啡馆之歌（作家榜经典文库）": "The Ballad of the Sad Café",
    "第三帝国的兴亡（增订版）": "The Rise and Fall of the Third Reich",
    "人间词话（作家榜经典文库）": "Poetic Remarks in the Human World",
    "列那狐的故事（作家榜经典文库）": "Reynard the Fox",
    "父与子全集（作家榜经典文库）": "Father and Son",
    "美丽的约定（作家榜经典文库）": "Le Grand Meaulnes",
    "吹牛大王历险记（作家榜经典文库）": "The Adventures of Baron Munchausen",
    "单向街（作家榜经典文库）": "One-Way Street",
    "猫咪事务所（作家榜经典文库）": "The Cat Office",
    "智慧书（作家榜经典文库）": "The Art of Worldly Wisdom",
    "艺术哲学（作家榜经典文库）": "The Philosophy of Art",
    "纳兰词（作家榜经典文库）": "The Ci Poems of Nalan Xingde",
    "陶渊明集（作家榜经典文库）": "The Collected Works of Tao Yuanming",
    "李煜诗词全集（作家榜经典文库）": "The Poems of Li Yu",
    "阿拉蕾（第1部：卷1~卷6）": "Dr. Slump (Part 1: Vols. 1-6)",
    "阿拉蕾（第2部：卷7~卷12）": "Dr. Slump (Part 2: Vols. 7-12)",
    "阿拉蕾（第3部：卷13~卷18）": "Dr. Slump (Part 3: Vols. 13-18)",
    "埃郡往事": "Essex County",
    "编剧的艺术": "The Art of Dramatic Writing",
    "巴黎卢浮宫": "The Louvre, Paris",
    "巴黎奥赛美术馆": "The Musée d'Orsay, Paris",
    "阿姆斯特丹国家博物馆": "The Rijksmuseum, Amsterdam",
    "阿姆斯特丹梵高博物馆": "The Van Gogh Museum, Amsterdam",
    "阿姆斯特丹：世界最自由城市的历史": "Amsterdam: A History of the World's Most Liberal City",
    "100天后会死的鳄鱼君": "The Crocodile Who Dies in 100 Days",
    "镖人": "Blades of the Guardians",
    "镖人2": "Blades of the Guardians, Vol. 2",
    "镖人3": "Blades of the Guardians, Vol. 3",
    "镖人4": "Blades of the Guardians, Vol. 4",
    "镖人5": "Blades of the Guardians, Vol. 5",
    "镖人6": "Blades of the Guardians, Vol. 6",
    "镖人7": "Blades of the Guardians, Vol. 7",
    "镖人8": "Blades of the Guardians, Vol. 8",
    "镖人9": "Blades of the Guardians, Vol. 9",
    "镖人10": "Blades of the Guardians, Vol. 10",
    "镖人11": "Blades of the Guardians, Vol. 11",
    "当我谈跑步时，我谈些什么": "What I Talk About When I Talk About Running",
    "我的职业是小说家": "Novelist as a Vocation",
    "没有女人的男人们": "Men Without Women",
    "去中国的小船": "A Slow Boat to China",
    "弃猫": "Abandoning a Cat",
    "地下：东京地铁沙林毒气事件实录（套装共2册）": "Underground",
    "盛夏方程式": "A Midsummer's Equation",
    "假面饭店": "Masquerade Hotel",
    "假面之夜": "Masquerade Night",
    "白金数据": "Platinum Data",
    "沉睡的人鱼之家": "The House Where the Mermaid Sleeps",
    "眼之壁": "Wall of Eyes",
    "金色梦乡": "Golden Slumber",
    "姑获鸟之夏": "Summer of the Ubume",
    "所罗门的伪证第Ⅰ部：事件": "Solomon's Perjury, Part I: The Incident",
    "所罗门的伪证第Ⅱ部：决意": "Solomon's Perjury, Part II: Resolution",
    "所罗门的伪证第Ⅲ部：法庭": "Solomon's Perjury, Part III: Court",
    "失乐园": "A Lost Paradise",
    "细雪": "The Makioka Sisters",
    "痴人之爱": "Naomi",
    "爱的饥渴": "Thirst for Love",
    "后来的事": "And Then",
    "津轻": "Tsugaru",
    "小丑之花": "The Flowers of Buffoonery",
    "夏天、烟火和我的尸体": "Summer, Fireworks, and My Corpse",
    "动物园": "Zoo",
    "冰菓套装（共6册）": "Hyouka",
    "阴阳师典藏合集（共5册）": "Onmyoji",
    "妖猫传（全4册）": "Legend of the Demon Cat",
    "罗马人的故事（套装共15册）": "The Story of the Romans",
    "希腊人的故事（全三册）": "The Story of the Greeks",
    "海都物语": "A Tale of the Sea City",
    "长日留痕": "The Remains of the Day",
    "浮世画家": "An Artist of the Floating World",
    "远山淡影": "A Pale View of Hills",
    "无可慰藉": "The Unconsoled",
    "被掩埋的巨人": "The Buried Giant",
    "克拉拉与太阳": "Klara and the Sun",
    "小夜曲": "Nocturnes",
    "没有人给他写信的上校": "No One Writes to the Colonel",
    "苦妓回忆录": "Memories of My Melancholy Whores",
    "迷宫中的将军": "The General in His Labyrinth",
    "爱情和其他魔鬼": "Of Love and Other Demons",
    "一个海难幸存者的故事": "The Story of a Shipwrecked Sailor",
    "世上最美的溺水者": "The Handsomest Drowned Man in the World",
    "番石榴飘香": "The Fragrance of Guava",
    "反抗者": "The Rebel",
    "异乡人": "The Stranger",
    "流亡与独立王国": "Exile and the Kingdom",
    "卡利古拉": "Caligula",
    "正义者": "The Just Assassins",
    "鬼": "Demons",
    "被伤害与侮辱的人们": "The Insulted and the Injured",
    "一九八四": "Nineteen Eighty-Four",
    "坟场之书": "The Graveyard Book",
    "星尘": "Stardust",
    "美国众神（十周年作者修订版）": "American Gods",
    "北欧众神": "Norse Mythology",
    "烟与镜": "Smoke and Mirrors",
    "乌有乡": "Neverwhere",
    "易碎品": "Fragile Things",
    "蜘蛛男孩": "Anansi Boys",
    "高能预警": "Trigger Warning",
    "高堡奇人": "The Man in the High Castle",
    "少数派报告": "The Minority Report",
    "尤比克": "Ubik",
    "流吧！我的眼泪": "Flow My Tears, the Policeman Said",
    "华氏451": "Fahrenheit 451",
    "火星编年史": "The Martian Chronicles",
    "蒲公英醇夏": "Dandelion Wine",
    "夏日永别": "Farewell Summer",
    "十月国度": "The October Country",
    "闪灵": "The Shining",
    "宠物公墓": "Pet Sematary",
    "肖申克的救赎（纪念珍藏版）": "The Shawshank Redemption",
    "它（全2册）": "It",
    "绿里": "The Green Mile",
    "克里斯汀": "Christine",
    "捕梦网": "Dreamcatcher",
    "穹顶之下": "Under the Dome",
    "黑暗塔系列（套装共8册）": "The Dark Tower",
    "112263": "11/22/63",
    "冰与火之歌15卷（全15册）": "A Song of Ice and Fire",
    "冰与火之歌：权力的游戏（图像小说1）": "A Game of Thrones: The Graphic Novel, Vol. 1",
    "冰与火之歌：权力的游戏（图像小说2）": "A Game of Thrones: The Graphic Novel, Vol. 2",
    "冰与火之歌：权力的游戏（图像小说3）": "A Game of Thrones: The Graphic Novel, Vol. 3",
    "冰与火之歌：权力的游戏（图像小说4）": "A Game of Thrones: The Graphic Novel, Vol. 4",
    "血与火：坦格利安王朝史": "Fire & Blood",
    "百变王牌套装": "Wild Cards",
    "永恒的终结": "The End of Eternity",
    "神们自己": "The Gods Themselves",
    "银河帝国：帝国三部曲": "The Galactic Empire Novels",
    "银河帝国：机器人五部曲": "The Robot Novels",
    "与罗摩相会": "Rendezvous with Rama",
    "太空漫游": "A Space Odyssey",
    "神的九十亿个名字": "The Nine Billion Names of God",
    "碟形世界：卫兵！卫兵！": "Guards! Guards!",
    "碟形世界：魔法的颜色": "The Colour of Magic",
    "碟形世界：平等权利": "Equal Rites",
    "碟形世界：异光": "The Light Fantastic",
    "碟形世界：死神学徒": "Mort",
    "碟形世界：金字塔": "Pyramids",
    "碟形世界：大法": "Sourcery",
    "碟形世界：猫和少年魔笛手": "The Amazing Maurice and His Educated Rodents",
    "崩溃：社会如何选择成败兴亡": "Collapse: How Societies Choose to Fail or Succeed",
    "剧变": "Upheaval",
    "自私的基因（40周年增订版）": "The Selfish Gene",
    "祖先的故事": "The Ancestor's Tale",
    "魔鬼的牧师": "A Devil's Chaplain",
    "基因之河": "River Out of Eden",
    "语言本能": "The Language Instinct",
    "心智探奇": "How the Mind Works",
    "白板": "The Blank Slate",
    "思想本质": "The Stuff of Thought",
    "当下的启蒙": "Enlightenment Now",
    "风格感觉：21世纪写作指南": "The Sense of Style",
    "非对称风险": "Skin in the Game",
    "引爆点：如何制造流行": "The Tipping Point",
    "陌生人效应": "Talking to Strangers",
    "逆转": "David and Goliath",
    "万物简史": "A Short History of Nearly Everything",
    "人体简史": "The Body",
    "全民自黑的英国": "Notes from a Small Island",
    "全民发呆的澳洲": "In a Sunburned Country",
    "布莱森英语简史": "The Mother Tongue",
    "圣殿春秋（全3册）": "The Pillars of the Earth",
    "无尽世界（全3册）": "World Without End",
    "巨人的陨落（全3册）": "Fall of Giants",
    "世界的凛冬（全3册）": "Winter of the World",
    "永恒的边缘（全3册）": "Edge of Eternity",
    "永恒火焰（全3册）": "A Column of Fire",
    "风暴岛": "Eye of the Needle",
    "雪人": "The Snowman",
    "蝙蝠": "The Bat",
    "蟑螂": "The Cockroaches",
    "知更鸟": "The Redbreast",
    "五芒星": "The Devil's Star",
    "幽灵": "Phantom",
    "警察": "Police",
    "救赎者": "The Redeemer",
    "猎豹（全二册）": "The Leopard",
    "焦渴": "The Thirst",
    "猎头游戏": "Headhunters",
    "捕鼠器": "The Mousetrap",
    "阿加莎·克里斯蒂自传": "Agatha Christie: An Autobiography",
    "马普尔小姐探案全集": "Miss Marple: The Complete Mysteries",
    "大侦探波洛探案全集": "Hercule Poirot: The Complete Mysteries",
    "莎士比亚全集（套装共10本）": "The Complete Works of Shakespeare",
    "莎士比亚四大悲剧": "Four Great Tragedies",
    "医学的真相": "The Laws of Medicine",
    "南方之星": "The Star of the South",
    "北方反对南方": "North Against South"
  };

  function subcategoryLabel(key) {
    if (currentLang === "zh-CN") {
      if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_LABELS, key)) return SUBCATEGORY_LABELS[key];
      return key;
    }
    if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_EN, key)) return SUBCATEGORY_EN[key];
    return key;
  }

  // 目录用拉丁字母存的中国作者。两种语言都显示汉字，不把中文作者转写成拼音。
  var AUTHOR_ZH = {
    "Laozi": "老子",
    "Mencius": "孟子",
    "Xun Lu": "鲁迅",
    "Jingzi Wu": "吴敬梓",
    "Xianzu Tang": "汤显祖",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "Guanzhong Luo": "罗贯中",
    "Xiang Liu": "刘向",
    "Kuo Shen": "沈括",
    "Jianren Wu": "吴趼人",
    "active 150 B.C. Ying Han": "韩婴",
    "Tianhuazangzhuren": "天花藏主人",
    "active 317-322 Bao Gan": "干宝",
    "Zhitui Yan": "颜之推",
    "Menglong Feng": "冯梦龙",
    "Qian Tao": "陶潜",
    "Shizhen Wang": "王世贞",
    "Mengchu Ling": "凌濛初",
    "Mei Yuan": "袁枚",
    "Shi Su": "苏轼",
    "Hanqing Guan": "关汉卿",
    "active 1596 Zicheng Hong": "洪自诚",
    "Boyuan Li": "李伯元",
    "E Liu": "刘鹗",
    "Yiqing Liu": "刘义庆",
    "Songling Pu": "蒲松龄",
    "active 6th century B.C. Sunzi": "孙武",
    "Yangming Wang": "王阳明",
    "Dai Zhang": "张岱",
    "Ming Zuoqiu": "左丘明",
    "Hong Ge": "葛洪",
    "Xiu Ouyang": "欧阳修",
    "Yang Shang": "商鞅",
    "Xueqin Cao": "曹雪芹",
    "Zhi Cao": "曹植",
    "Shou Chen": "陈寿",
    "Confucius": "孔子",
    "Yanwu Gu": "顾炎武",
    "Bangqing Han": "韩邦庆",
    "Fei Han": "韩非",
    "Bai Li": "李白",
    "Ruzhen Li": "李汝珍",
    "An Liu": "刘安",
    "Xie Liu": "刘勰",
    "Di Mo": "墨翟",
    "Nai'an Shi": "施耐庵",
    "Qian Sima": "司马迁",
    "Yingxing Song": "宋应星",
    "Tuotuo": "脱脱",
    "Shifu Wang": "王实甫",
    "Cheng'en Wu": "吴承恩",
    "Xiaoxiaosheng": "兰陵笑笑生",
    "Xingsi Zhou": "周兴嗣",
    "active 168-196 Zhongjing Zhang": "张仲景",
    "active 4th century Jia Wang": "王嘉",
    "Gu Ban": "班固",
    "Baowenglaoren": "抱瓮老人",
    "Qingxincairen": "青心才人",
    "Fu Shen": "沈复",
    "active 4th century B.C. Guiguzi": "鬼谷子",
    "active 4th century B.C. Liezi": "列子",
    "Zhong Guan": "管仲",
    "Xi Zhu": "朱熹",
    "Pu Zeng": "曾朴",
    "Pu Guo": "郭璞",
    "Shangren Kong": "孔尚任",
    "Cixin Liu": "刘慈欣",
    "Zhihua Zhou": "周志华",
    "Dafu Yu": "郁达夫",
    "Chao Zhang": "张潮",
    "Chen Chen": "陈忱",
    "Kun Lü": "吕坤",
    "Fu Kong": "孔鲋",
    "Xixing Lu": "陆西星",
    "Zhen Lin": "林鍼",
    "Yi Zhao": "赵翼",
    "Yu Li": "李渔",
    "Ainajushi": "艾衲居士",
    "Xihuyuyinzhuren": "西湖渔隐主人",
    "Tanmengdaoren": "贪梦道人",
    "active 18th century Su'anzhuren": "素庵主人",
    "active 1842-1851 Wenkang": "文康",
    "active 16th century Damu Xiong": "熊大木"
  };

  // 目录已经是英文的外国人名。只在中文界面换成通行中文名。
  var AUTHOR_ZH_FOREIGN = {
    "James Legge": "理雅各",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "Anonymous": "佚名",
    "Ken Liu": "刘宇昆",
    "Yiyun Li": "李翊云"
  };

  // 英文界面只替换能确定的外国人名。中文作者、空作者、佚名以外的不确定名字保持原样。
  var AUTHOR_EN = {
    "理查德・费曼": "Richard P. Feynman",
    "尼尔・德格拉斯・泰森": "Neil deGrasse Tyson",
    "尼尔・德格拉斯・泰森/唐纳德・戈德史密斯": "Neil deGrasse Tyson / Donald Goldsmith",
    "蕾切尔・卡森": "Rachel Carson",
    "悉达多・穆克吉": "Siddhartha Mukherjee",
    "埃尔温・薛定谔": "Erwin Schrödinger",
    "埃迪・普罗斯": "Addy Pross",
    "贾雷德·戴蒙德": "Jared Diamond",
    "贾雷德・戴蒙德": "Jared Diamond",
    "卡尔・齐默": "Carl Zimmer",
    "刘易斯・托马斯": "Lewis Thomas",
    "尤瓦尔・赫拉利": "Yuval Noah Harari",
    "[以色列]尤瓦尔·赫拉利": "Yuval Noah Harari",
    "（英）史蒂芬·霍金": "Stephen Hawking",
    "史蒂芬・霍金": "Stephen Hawking",
    "斯蒂芬・霍金": "Stephen Hawking",
    "欧几里得": "Euclid",
    // 通行英译。键与目录原文完全一致；没有标准译名的不收录。
    "斯蒂芬・金": "Stephen King",
    "威廉・莎士比亚": "William Shakespeare",
    "帕特里克・莫迪亚诺": "Patrick Modiano",
    "威廉・萨姆塞特・毛姆": "W. Somerset Maugham",
    "威廉・萨默塞特・毛姆": "W. Somerset Maugham",
    "阿尔贝・加缪": "Albert Camus",
    "加西亚・马尔克斯": "Gabriel García Márquez",
    "尤・奈斯博": "Jo Nesbø",
    "肯・福莱特": "Ken Follett",
    "雷蒙德・钱德勒": "Raymond Chandler",
    "阿兰・德波顿": "Alain de Botton",
    "菲利普・罗斯": "Philip Roth",
    "尼尔・盖曼": "Neil Gaiman",
    "比尔・布莱森": "Bill Bryson",
    "特里・普拉切特": "Terry Pratchett",
    "罗贝托・波拉尼奥": "Roberto Bolaño",
    "弗雷德里克・巴克曼": "Fredrik Backman",
    "阿摩司・奥兹": "Amos Oz",
    "玛格丽特・阿特伍德": "Margaret Atwood",
    "约翰・布罗克曼": "John Brockman",
    "彼得・汉德克": "Peter Handke",
    "约翰・斯卡尔齐": "John Scalzi",
    "约翰・欧文": "John Irving",
    "哈罗德・布鲁姆": "Harold Bloom",
    "弗朗西斯・福山": "Francis Fukuyama",
    "乔治・奥威尔": "George Orwell",
    "阿加莎・克里斯蒂": "Agatha Christie",
    "约翰・斯坦贝克": "John Steinbeck",
    "藤子·F·不二雄": "Fujiko F. Fujio",
    "雷・布拉德伯里": "Ray Bradbury",
    "理查德・道金斯": "Richard Dawkins",
    "欧内斯特・海明威": "Ernest Hemingway",
    "乔治·R.R.马丁": "George R. R. Martin",
    "奥森・斯科特・卡德": "Orson Scott Card",
    "阿瑟・克拉克": "Arthur C. Clarke",
    "西蒙・蒙蒂菲奥里": "Simon Sebag Montefiore",
    "戴维・洛奇": "David Lodge",
    "埃莱娜・费兰特": "Elena Ferrante",
    "查尔斯・狄更斯": "Charles Dickens",
    "狄更斯": "Charles Dickens",
    "列夫・托尔斯泰": "Leo Tolstoy",
    "托尔斯泰": "Leo Tolstoy",
    "菲利普・迪克": "Philip K. Dick",
    "伊恩・布鲁玛": "Ian Buruma",
    "儒勒・凡尔纳": "Jules Verne",
    "凡尔纳": "Jules Verne",
    "马克斯・韦伯": "Max Weber",
    "爱德华・威尔逊": "Edward O. Wilson",
    "巴巴拉・W・塔奇曼": "Barbara W. Tuchman",
    "巴巴拉・塔奇曼": "Barbara W. Tuchman",
    "史蒂芬・平克": "Steven Pinker",
    "博多・舍费尔": "Bodo Schäfer",
    "西德尼・谢尔顿": "Sidney Sheldon",
    "埃里希・玛丽亚・雷马克": "Erich Maria Remarque",
    "丹・西蒙斯": "Dan Simmons",
    "史蒂芬・柯维": "Stephen R. Covey",
    "劳伦斯・布洛克": "Lawrence Block",
    "马洛伊・山多尔": "Sándor Márai",
    "爱德华・圣奥宾": "Edward St. Aubyn",
    "蒂姆・哈福德": "Tim Harford",
    "卡尔・奥韦・克瑙斯高": "Karl Ove Knausgård",
    "维克多・雨果": "Victor Hugo",
    "雨果": "Victor Hugo",
    "索尔・贝娄": "Saul Bellow",
    "布琳・布朗": "Brené Brown",
    "马尔科姆・格拉德威尔": "Malcolm Gladwell",
    "斯蒂芬・茨威格": "Stefan Zweig",
    "斯・茨威格": "Stefan Zweig",
    "斯特凡・茨威格": "Stefan Zweig",
    "伊恩・麦克尤恩": "Ian McEwan",
    "威尔・杜兰特": "Will Durant",
    "奥斯卡・王尔德": "Oscar Wilde",
    "赫尔曼・黑塞": "Hermann Hesse",
    "赫尔曼?黑塞": "Hermann Hesse",
    "罗曼・罗兰": "Romain Rolland",
    "赫伯特・乔治・威尔斯": "H. G. Wells",
    "艾萨克・阿西莫夫": "Isaac Asimov",
    "阿尔弗雷德・阿德勒": "Alfred Adler",
    "约翰・迪克森・卡尔": "John Dickson Carr",
    "罗尔德・达尔": "Roald Dahl",
    "保罗・索鲁": "Paul Theroux",
    "弗吉尼亚・伍尔夫": "Virginia Woolf",
    "库尔特・冯内古特": "Kurt Vonnegut",
    "威廉・吉布森": "William Gibson",
    "埃德加・爱伦・坡": "Edgar Allan Poe",
    "沃尔特・艾萨克森": "Walter Isaacson",
    "豪尔赫・路易斯・博尔赫斯": "Jorge Luis Borges",
    "詹姆斯・乔伊斯": "James Joyce",
    "查克・温迪格": "Chuck Wendig",
    "理查德・耶茨": "Richard Yates",
    "威廉・福克纳": "William Faulkner",
    "戴尔・卡耐基": "Dale Carnegie",
    "朱利安・巴恩斯": "Julian Barnes",
    "马特・海格": "Matt Haig",
    "托马斯・沃尔夫": "Thomas Wolfe",
    "托马斯・品钦": "Thomas Pynchon",
    "梅兰妮・克莱因": "Melanie Klein",
    "艾瑞克·霍布斯鲍姆": "Eric Hobsbawm",
    "塞萨尔・艾拉": "César Aira",
    "亨利・基辛格": "Henry Kissinger",
    "加・泽文": "Gabrielle Zevin",
    "珍妮特・温特森": "Jeanette Winterson",
    "弗朗索瓦・阿赫托戈": "François Hartog",
    "杰夫・戴尔": "Geoff Dyer",
    "弗里德里希・尼采": "Friedrich Nietzsche",
    "尼采": "Friedrich Nietzsche",
    "欧・亨利": "O. Henry",
    "克莱儿・麦克福尔": "Claire McFall",
    "科马克・麦卡锡": "Cormac McCarthy",
    "杰克・凯鲁亚克": "Jack Kerouac",
    "迈克尔・桑德尔": "Michael J. Sandel",
    "达芙妮・杜穆里埃": "Daphne du Maurier",
    "伊恩・托尔": "Ian W. Toll",
    "罗伯特・哈格斯特朗": "Robert G. Hagstrom",
    "阿道司・赫胥黎": "Aldous Huxley",
    "奥兰多・费吉斯": "Orlando Figes",
    "夏洛蒂・勃朗特": "Charlotte Brontë",
    "艾米莉・勃朗特": "Emily Brontë",
    "爱米丽・勃朗特": "Emily Brontë",
    "蕾秋・乔伊斯": "Rachel Joyce",
    "勒内・格鲁塞": "René Grousset",
    "皮耶尔・勒迈特": "Pierre Lemaitre",
    "爱德华・德博诺": "Edward de Bono",
    "大卫・克里斯蒂安": "David Christian",
    "马克・李维": "Marc Levy",
    "奇普・希思/丹・希思": "Chip Heath / Dan Heath",
    "克莱顿・克里斯坦森": "Clayton M. Christensen",
    "威廉・庞德斯通": "William Poundstone",
    "彼得・渥雷本": "Peter Wohlleben",
    "戴维・迈尔斯": "David G. Myers",
    "赫尔曼・麦尔维尔": "Herman Melville",
    "赫尔曼・梅尔维尔": "Herman Melville",
    "丽莎・兰道尔": "Lisa Randall",
    "卡洛・罗韦利": "Carlo Rovelli",
    "彼得・德鲁克": "Peter F. Drucker",
    "若泽・萨拉马戈": "José Saramago",
    "盖伊・特立斯": "Gay Talese",
    "玛格丽特・尤瑟纳尔": "Marguerite Yourcenar",
    "厄休拉・勒古恩": "Ursula K. Le Guin",
    "维罗尼卡・罗斯": "Veronica Roth",
    "艾丽丝・门罗": "Alice Munro",
    "威廉・麦克尼尔": "William H. McNeill",
    "朱迪・皮考特": "Jodi Picoult",
    "道格拉斯・亚当斯": "Douglas Adams",
    "赫尔曼・沃克": "Herman Wouk",
    "迈克尔・刘易斯": "Michael Lewis",
    "理查德・怀斯曼": "Richard Wiseman",
    "扬・马特尔": "Yann Martel",
    "马丁・瓦尔泽": "Martin Walser",
    "迈克尔・夏邦": "Michael Chabon",
    "彼得・圣吉": "Peter M. Senge",
    "大卫・阿尔蒙德": "David Almond",
    "乔治・巴塔耶": "Georges Bataille",
    "约翰・厄普代克": "John Updike",
    "儒勒・米什莱": "Jules Michelet",
    "弗朗索瓦丝・萨冈": "Françoise Sagan",
    "哈珀・李": "Harper Lee",
    "翁贝托・埃科": "Umberto Eco",
    "翁贝托・艾柯": "Umberto Eco",
    "特德・姜": "Ted Chiang",
    "布兰登・桑德森": "Brandon Sanderson",
    "约翰・勒卡雷": "John le Carré",
    "罗伯特・西奥迪尼": "Robert B. Cialdini",
    "斯蒂格・拉森": "Stieg Larsson",
    "费尔南多・佩索阿": "Fernando Pessoa",
    "奥尔加・托卡尔丘克": "Olga Tokarczuk",
    "瑞・达利欧": "Ray Dalio",
    "纳尔逊・曼德拉": "Nelson Mandela",
    "托马斯・哈代": "Thomas Hardy",
    "彼得・海斯勒": "Peter Hessler",
    "菲利普・津巴多": "Philip Zimbardo",
    "简・奥斯丁": "Jane Austen",
    "简・奥斯汀": "Jane Austen",
    "乔纳斯・嘉德尔": "Jonas Gardell",
    "乔斯坦・贾德": "Jostein Gaarder",
    "马塞尔・普鲁斯特": "Marcel Proust",
    "米哈伊尔・布尔加科夫": "Mikhail Bulgakov",
    "布尔加科夫": "Mikhail Bulgakov",
    "卡勒德・胡赛尼": "Khaled Hosseini",
    "丹・布朗": "Dan Brown",
    "伊塔洛・卡尔维诺": "Italo Calvino",
    "奥尔罕・帕慕克": "Orhan Pamuk",
    "帕特里克・聚斯金德": "Patrick Süskind",
    "普里莫・莱维": "Primo Levi",
    "杜鲁门・卡波特": "Truman Capote",
    "阿瑟・黑利": "Arthur Hailey",
    "诺姆・乔姆斯基": "Noam Chomsky",
    "斯坦尼斯瓦夫・莱姆": "Stanisław Lem",
    "安东・契诃夫": "Anton Chekhov",
    "契诃夫": "Anton Chekhov",
    "本杰明・格雷厄姆": "Benjamin Graham",
    "詹姆斯・格雷克": "James Gleick",
    "弗拉基米尔・纳博科夫": "Vladimir Nabokov",
    "托马斯・曼": "Thomas Mann",
    "约翰・杜威": "John Dewey",
    "阿图尔・叔本华": "Arthur Schopenhauer",
    "伯特兰・罗素": "Bertrand Russell",
    "卡尔・波普尔": "Karl Popper",
    "乔纳森・斯威夫特": "Jonathan Swift",
    "丹尼尔・笛福": "Daniel Defoe",
    "伊夫林・沃": "Evelyn Waugh",
    "亨利・詹姆斯": "Henry James",
    "杰克・伦敦": "Jack London",
    "苏珊・桑塔格": "Susan Sontag",
    "希拉里・曼特尔": "Hilary Mantel",
    "吉莉安・弗琳": "Gillian Flynn",
    "迈克尔・康奈利": "Michael Connelly",
    "胡里奥・科塔萨尔": "Julio Cortázar",
    "胡利奥・科塔萨尔": "Julio Cortázar",
    "安德烈・纪德": "André Gide",
    "阿尔文・托夫勒": "Alvin Toffler",
    "谢丽尔・桑德伯格": "Sheryl Sandberg",
    "本・伯南克": "Ben Bernanke",
    "亚当・格兰特": "Adam Grant",
    "本尼迪克特・安德森": "Benedict Anderson",
    "尼尔・斯蒂芬森": "Neal Stephenson",
    "罗伯特・海因莱因": "Robert A. Heinlein",
    "安迪・威尔": "Andy Weir",
    "兰道尔・门罗": "Randall Munroe",
    "康妮・威利斯": "Connie Willis",
    "汤姆・克兰西": "Tom Clancy",
    "安东尼・伯吉斯": "Anthony Burgess",
    "达希尔・哈米特": "Dashiell Hammett",
    "雪莉・杰克逊": "Shirley Jackson",
    "艾・里斯/劳拉・里斯": "Al Ries / Laura Ries",
    "[日]东野圭吾": "Keigo Higashino",
    "[日] 东野圭吾": "Keigo Higashino",
    "村上春树": "Haruki Murakami",
    "松本清张": "Seicho Matsumoto",
    "川端康成": "Yasunari Kawabata",
    "三岛由纪夫": "Yukio Mishima",
    "夏目漱石": "Natsume Soseki",
    "谷崎润一郎": "Junichiro Tanizaki",
    "芥川龙之介": "Ryunosuke Akutagawa",
    "宫部美雪": "Miyuki Miyabe",
    "伊坂幸太郎": "Kotaro Isaka",
    "京极夏彦": "Natsuhiko Kyogoku",
    "绫辻行人": "Yukito Ayatsuji",
    "乙一": "Otsuichi",
    "米泽穗信": "Honobu Yonezawa",
    "盐野七生": "Nanami Shiono",
    "梦枕貘": "Baku Yumemakura",
    "坂口安吾": "Ango Sakaguchi",
    "渡边淳一": "Junichi Watanabe",
    "稻盛和夫": "Kazuo Inamori",
    "一行禅师": "Thich Nhat Hanh",
    "韩炳哲": "Byung-Chul Han",
    "池井户润": "Jun Ikeido",
    "陈舜臣": "Chin Shunshin",
    "小泉八云": "Lafcadio Hearn",
    "柳田国男": "Kunio Yanagita",
    "田中贡太郎": "Kotaro Tanaka",
    "紫式部": "Murasaki Shikibu",
    "太宰治": "Osamu Dazai",
    "青山刚昌": "Gosho Aoyama",
    "鸟山明": "Akira Toriyama",
    "岸本齐史": "Masashi Kishimoto",
    "吾峠呼世晴": "Koyoharu Gotouge",
    "高桥留美子": "Rumiko Takahashi",
    "车田正美": "Masami Kurumada",
    "绿川幸": "Yuki Midorikawa",
    "臼井仪人": "Yoshito Usui",
    "孔飞力": "Philip A. Kuhn",
    "斯塔夫里阿诺斯": "L. S. Stavrianos",
    "大仲马": "Alexandre Dumas",
    "亚历山大・仲马": "Alexandre Dumas",
    "福楼拜": "Gustave Flaubert",
    "居斯达夫・福楼拜": "Gustave Flaubert",
    "莫泊桑": "Guy de Maupassant",
    "司汤达": "Stendhal",
    "但丁": "Dante Alighieri",
    "塞万提斯": "Miguel de Cervantes",
    "卡夫卡": "Franz Kafka",
    "弗兰茨・卡夫卡": "Franz Kafka",
    "柏拉图": "Plato",
    "陀思妥耶夫斯基": "Fyodor Dostoevsky",
    "帕斯捷尔纳克": "Boris Pasternak",
    "鲍里斯・帕斯捷尔纳克": "Boris Pasternak",
    "尼・奥斯特洛夫斯基": "Nikolai Ostrovsky",
    "米・肖洛霍夫": "Mikhail Sholokhov",
    "米兰·昆德拉": "Milan Kundera",
    "米兰・昆德拉": "Milan Kundera",
    "亚当·斯密": "Adam Smith",
    "亚当・斯密": "Adam Smith",
    "J·K·罗琳": "J. K. Rowling",
    "J・K・罗琳": "J. K. Rowling",
    "V.S.奈保尔": "V. S. Naipaul",
    "企鹅经典": "Penguin Classics",
    "牛津通识读本": "Oxford Very Short Introductions",
    "柯南・道尔": "Arthur Conan Doyle",
    "阿瑟・柯南・道尔": "Arthur Conan Doyle",
    "圣埃克苏佩里": "Antoine de Saint-Exupéry",
    "安托万・德・圣埃克苏佩里": "Antoine de Saint-Exupéry",
    "圣-埃克苏佩里": "Antoine de Saint-Exupéry",
    "埃克苏佩里": "Antoine de Saint-Exupéry",
    "菲茨杰拉德": "F. Scott Fitzgerald",
    "斯科特・菲茨杰拉德": "F. Scott Fitzgerald",
    "弗・司各特・菲茨杰拉德": "F. Scott Fitzgerald",
    "马克・吐温": "Mark Twain",
    "约翰・沃尔夫冈・歌德": "Johann Wolfgang von Goethe",
    "弗洛伊德": "Sigmund Freud",
    "西格蒙德・弗洛伊德": "Sigmund Freud",
    "艾里希・弗洛姆": "Erich Fromm",
    "丹尼尔・卡尼曼": "Daniel Kahneman",
    "纳西姆・尼古拉斯・塔勒布": "Nassim Nicholas Taleb",
    "戴纳西姆・尼古拉斯・塔勒布": "Nassim Nicholas Taleb",
    "塔勒布": "Nassim Nicholas Taleb",
    "杰罗姆・大卫・塞林格": "J. D. Salinger",
    "纳撒尼尔・霍桑": "Nathaniel Hawthorne",
    "马丁・海德格尔": "Martin Heidegger",
    "约翰・梅纳德・凯恩斯": "John Maynard Keynes",
    "鲁思・本尼迪克特": "Ruth Benedict",
    "伊恩・布鲁马/鲁思・本尼迪克特": "Ian Buruma / Ruth Benedict",
    "J.R.R. 托尔金": "J. R. R. Tolkien",
    "弗兰克・赫伯特": "Frank Herbert",
    "布莱恩・赫伯特": "Brian Herbert",
    "伊万・谢尔盖耶维奇・屠格涅夫": "Ivan Turgenev",
    "伊凡・谢尔盖耶维奇・屠格涅夫": "Ivan Turgenev",
    "屠格涅夫": "Ivan Turgenev",
    "宫泽贤治": "Kenji Miyazawa",
    "樋口一叶": "Ichiyo Higuchi",
    "罗伯特・路易斯・史蒂文森": "Robert Louis Stevenson",
    "尼古拉・奥斯特洛夫斯基": "Nikolai Ostrovsky",
    "萨克雷": "William Makepeace Thackeray",
    "阿尔封斯・都德": "Alphonse Daudet",
    "刘易斯・卡罗尔": "Lewis Carroll",
    "奥诺雷·德·巴尔扎克": "Honoré de Balzac",
    "露西・莫德・蒙格玛丽": "L. M. Montgomery",
    "清少纳言": "Sei Shonagon",
    "古斯塔夫・勒庞": "Gustave Le Bon",
    "维吉尼亚・伍尔夫": "Virginia Woolf",
    "但丁・阿利吉耶里": "Dante Alighieri",
    "费奥多尔・米哈伊洛维奇・陀思妥耶夫斯基": "Fyodor Dostoevsky",
    "塞尔玛・拉格洛夫": "Selma Lagerlöf",
    "埃・拉斯伯": "Rudolf Erich Raspe",
    "阿兰・傅尼埃": "Alain-Fournier",
    "瓦尔特・本雅明": "Walter Benjamin",
    "威廉・卡克斯顿": "William Caxton",
    "巴尔塔萨尔・格拉西安": "Baltasar Gracián",
    "H. A. 丹纳": "Hippolyte Taine",
    "威廉・夏伊勒": "William L. Shirer",
    "卡森・麦卡勒斯": "Carson McCullers",
    "埃・奥・卜劳恩": "E. O. Plauen",
    "拉宾德拉纳特・泰戈尔": "Rabindranath Tagore",
    "儒勒・列那尔": "Jules Renard",
    "杰夫・勒米尔": "Jeff Lemire",
    "拉约什・埃格里": "Lajos Egri",
    "菊池祐纪": "Yuki Kikuchi",
    "中野京子": "Kyoko Nakano",
    "达尼埃拉・塔拉布拉": "Daniela Tarabra",
    "马特・里德利": "Matt Ridley",
    "史蒂文・约翰逊": "Steven Johnson",
    "约翰・格里宾": "John Gribbin",
    "伦纳德・蒙洛迪诺": "Leonard Mlodinow",
    "列纳德・蒙洛迪诺": "Leonard Mlodinow",
    "丹・琼斯": "Dan Jones",
    "斯坦尼斯拉斯・迪昂": "Stanislas Dehaene",
    "莱内・马利亚・里尔克": "Rainer Maria Rilke",
    "亨利・戴维・梭罗": "Henry David Thoreau",
    "罗尔夫・多贝里": "Rolf Dobelli",
    "彼得・沃森": "Peter Watson",
    "扶霞・邓洛普": "Fuchsia Dunlop",
    "阿尔贝托・莫拉维亚": "Alberto Moravia",
    "大卫・伊格曼": "David Eagleman",
    "马丁・塞利格曼": "Martin Seligman",
    "罗杰・克劳利": "Roger Crowley",
    "沙希利・浦洛基": "Serhii Plokhy",
    "彼得・希瑟": "Peter Heather",
    "诺曼・戴维斯": "Norman Davies",
    "特里・伊格尔顿": "Terry Eagleton",
    "吉姆・罗杰斯": "Jim Rogers",
    "克劳德・霍普金斯": "Claude C. Hopkins",
    "约翰・格林": "John Green",
    "克莉丝汀・汉娜": "Kristin Hannah",
    "查尔斯・汉迪": "Charles Handy",
    "迈克斯・泰格马克": "Max Tegmark",
    "约翰・威廉斯": "John Williams",
    "曼瑟・奥尔森": "Mancur Olson",
    "托尼・朱特": "Tony Judt",
    "以赛亚・伯林": "Isaiah Berlin",
    "以赛亚・伯林爵士": "Sir Isaiah Berlin",
    "皮尔斯・布朗": "Pierce Brown",
    "罗宾・霍布": "Robin Hobb",
    "卡尔・纽波特": "Cal Newport",
    "尼古拉斯・卡尔": "Nicholas Carr",
    "托马斯・福斯特": "Thomas C. Foster",
    "朱利安・巴吉尼": "Julian Baggini",
    "保罗・巴奇加卢皮": "Paolo Bacigalupi",
    "丹尼尔・席尔瓦": "Daniel Silva",
    "裘帕・拉希莉": "Jhumpa Lahiri",
    "爱德华多・加莱亚诺": "Eduardo Galeano",
    "彼得・林奇": "Peter Lynch",
    "杰克・特劳特": "Jack Trout",
    "凯特・莫顿": "Kate Morton",
    "卡洛斯・卡斯塔尼达": "Carlos Castaneda",
    "欧文・亚隆": "Irvin D. Yalom",
    "威廉・欧奈尔": "William J. O'Neil",
    "乔乔・莫伊斯": "Jojo Moyes",
    "阿图・葛文德": "Atul Gawande",
    "约翰・伯格": "John Berger",
    "约翰・基根": "John Keegan",
    "保罗・约翰逊": "Paul Johnson",
    "米盖尔・安赫尔・阿斯图里亚斯": "Miguel Ángel Asturias",
    "格雷琴・鲁宾": "Gretchen Rubin",
    "艾丽丝・默多克": "Iris Murdoch",
    "罗宾・邓巴": "Robin Dunbar",
    "珍・哈珀": "Jane Harper",
    "弗诺・文奇": "Vernor Vinge",
    "玛丽・比尔德": "Mary Beard",
    "尼尔・弗格森": "Niall Ferguson",
    "伊查克・爱迪思": "Ichak Adizes",
    "约翰・托兰": "John Toland",
    "约翰・博格": "John C. Bogle",
    "保罗・策兰": "Paul Celan",
    "贝尔・格里尔斯": "Bear Grylls",
    "马龙・詹姆斯": "Marlon James",
    "苏珊・怀斯・鲍尔": "Susan Wise Bauer",
    "安东尼・霍洛维茨": "Anthony Horowitz",
    "西蒙・沙玛": "Simon Schama",
    "罗伯特・瑟维斯": "Robert Service",
    "亚当・图兹": "Adam Tooze",
    "卡洛・金茨堡": "Carlo Ginzburg",
    "柴纳・米耶维": "China Miéville",
    "斯蒂芬・格林布拉特": "Stephen Greenblatt",
    "瑞安・霍利迪": "Ryan Holiday",
    "芭芭拉・艾伦瑞克": "Barbara Ehrenreich",
    "埃克哈特・托利": "Eckhart Tolle",
    "朱利安・阿桑奇": "Julian Assange",
    "李・斯莫林": "Lee Smolin",
    "迈克尔・翁达杰": "Michael Ondaatje",
    "米奇・阿尔博姆": "Mitch Albom",
    "卡尔・古斯塔夫・荣格": "Carl Gustav Jung",
    "所罗门・诺瑟普": "Solomon Northup",
    "大卫・哈维": "David Harvey",
    "查尔斯・都希格": "Charles Duhigg",
    "威廉・曼彻斯特": "William Manchester",
    "詹姆斯・米切纳": "James A. Michener",
    "阿斯沃斯・达摩达兰": "Aswath Damodaran",
    "尼尔・麦格雷戈": "Neil MacGregor",
    "塞巴斯蒂安·哈夫纳": "Sebastian Haffner",
    "克莱・舍基": "Clay Shirky",
    "罗杰・泽拉兹尼": "Roger Zelazny",
    "马丁・林斯特龙": "Martin Lindstrom",
    "埃里克・安布勒": "Eric Ambler",
    "彼得・戴曼迪斯": "Peter H. Diamandis",
    "菲利帕・佩里": "Philippa Perry",
    "贾尔斯・米尔顿": "Giles Milton",
    "尤金・罗根": "Eugene Rogan",
    "爱德华・哈洛韦尔": "Edward Hallowell",
    "萨曼塔・施维伯林": "Samanta Schweblin",
    "劳伦斯・赖特": "Lawrence Wright",
    "埃里克・杰・多林": "Eric Jay Dolin",
    "约翰・达尔文": "John Darwin",
    "多米尼克・利芬": "Dominic Lieven",
    "马克・彭德格拉斯特": "Mark Pendergrast",
    "乔舒亚・贝克尔": "Joshua Becker",
    "乔纳・伯杰": "Jonah Berger",
    "丹尼尔・科伊尔": "Daniel Coyle",
    "赫伯特・比克斯": "Herbert P. Bix",
    "弗里茨・斯特恩": "Fritz Stern",
    "凯莱布・沙夫": "Caleb Scharf",
    "亚历克斯・索勇－金・庞": "Alex Soojung-Kim Pang",
    "多米尼克・奥布莱恩": "Dominic O'Brien",
    "爱德华・布鲁克-海钦": "Edward Brooke-Hitching",
    "约翰・朱利叶斯・诺威奇": "John Julius Norwich",
    "丹・米尔曼": "Dan Millman",
    "德斯蒙德・苏厄德": "Desmond Seward",
    "阿尔贝托・安杰拉": "Alberto Angela",
    "苏・布莱克": "Sue Black",
    "阿利斯泰尔・霍恩": "Alistair Horne",
    "科林・伍达德": "Colin Woodard",
    "马歇尔・古德史密斯": "Marshall Goldsmith",
    "凯尔泰斯・伊姆莱": "Imre Kertész",
    "米歇尔・渥克": "Michele Wucker",
    "罗伯特・赖特": "Robert Wright",
    "本・斯泰尔": "Benn Steil",
    "彼得·海斯勒": "Peter Hessler",
    "马丁·福勒(Martin Fowler)": "Martin Fowler",
    "罗兰·米勒 (Rowland S. Miller)": "Rowland S. Miller"
  };

  function authorLabel(name) {
    var text = name ? String(name).trim() : "";
    if (!text) return t("unknownAuthor");
    if (Object.prototype.hasOwnProperty.call(AUTHOR_ZH, text)) return AUTHOR_ZH[text];
    if (currentLang === "zh-CN") {
      if (Object.prototype.hasOwnProperty.call(AUTHOR_ZH_FOREIGN, text)) return AUTHOR_ZH_FOREIGN[text];
      return text;
    }
    if (text === "佚名") return "Anonymous";
    if (Object.prototype.hasOwnProperty.call(AUTHOR_EN, text)) return AUTHOR_EN[text];
    return text;
  }

  // 作者未知时不展示作者（不显示“佚名/Unknown”）
  function isUnknownAuthor(text) {
    var s = text ? String(text).trim() : "";
    if (!s) return true;
    if (s === "佚名" || s === "Anonymous" || s === "Unknown" || s === "未知") return true;
    var unknown = t("unknownAuthor");
    return !!(unknown && s === unknown);
  }

  function classicDisplay(book) {
    if (currentLang === "zh-CN" || !book) return null;
    var stored = book.t ? String(book.t).trim() : "";
    var storedZh = book.zh ? String(book.zh).trim() : "";
    if (stored && Object.prototype.hasOwnProperty.call(TITLE_EN, stored)) {
      return { heading: TITLE_EN[stored], subtitle: stored };
    }
    if (storedZh && Object.prototype.hasOwnProperty.call(TITLE_EN, storedZh)) {
      return {
        heading: stored && stored !== storedZh ? stored : TITLE_EN[storedZh],
        subtitle: storedZh
      };
    }
    return null;
  }

  function trimText(value) {
    return value ? String(value).trim() : "";
  }

  function isDigitsOnly(value) {
    return /^\d+$/.test(trimText(value));
  }

  function filenameStem(book) {
    var name = trimText(book && book.f);
    if (!name) return "";
    var slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
    if (slash >= 0) name = name.slice(slash + 1);
    var dot = name.lastIndexOf(".");
    if (dot > 0) name = name.slice(0, dot);
    return name.trim();
  }

  // arXiv 编号（2610.32948）和馆藏序号（1785-1984）都不是书名。
  function isBareIdentifier(value) {
    var text = trimText(value);
    return /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(text) || /^\d+[-_.]\d+$/.test(text);
  }

  function isRealTitle(value) {
    var text = trimText(value);
    return !!text && !isDigitsOnly(text) && !isBareIdentifier(text);
  }

  function hasEnglishWords(value) {
    return /[A-Za-z]{2,}/.test(trimText(value));
  }

  // 英文书名。不用中文译名。纯数字时，只从文件名里的英文词恢复；
  // 文件名若是被削短的 arXiv 编号，则用完整编号，仍不改用译名。
  function originalTitle(book) {
    var stored = trimText(book && book.t);
    if (isRealTitle(stored)) return stored;
    var stem = filenameStem(book);
    if (hasEnglishWords(stem) && isRealTitle(stem)) return stem;
    if (stem && !isDigitsOnly(stem) && !isBareIdentifier(stem)) return stem;
    if (
      /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(stem) &&
      stored &&
      stem.slice(-stored.length) === stored &&
      stored !== stem
    ) {
      return stem;
    }
    return stored || stem || "";
  }

  function cardHeading(book) {
    var classic = classicDisplay(book);
    if (classic) return { primary: classic.heading, secondary: classic.subtitle };
    var zhTitle = chineseTitle(book);
    var original = originalTitle(book) || t("untitled");
    if (zhTitle) {
      var secondary = original !== zhTitle && isRealTitle(original) ? original : "";
      return { primary: zhTitle, secondary: secondary };
    }
    return { primary: original, secondary: "" };
  }

  function readLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "zh-CN") return saved;
    } catch (err) {}
    return "zh-CN";
  }

  function fillText(selector, attr, write) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute(attr);
      if (!key) continue;
      write(nodes[i], t(key));
    }
  }

  function applyLanguage(lang, persist) {
    currentLang = lang === "zh-CN" ? "zh-CN" : "en";
    document.documentElement.lang = currentLang;
    document.documentElement.setAttribute("data-lang", currentLang === "zh-CN" ? "zh" : "en");
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, currentLang);
      } catch (err) {}
    }
    document.title = PAPERS_PAGE
      ? t("pickedTitle") + " · " + (currentLang === "zh-CN" ? "书海拾贝" : "Ebook Vault")
      : t("docTitle");
    var metaDesc = document.querySelector('meta[name="description"][lang="' + currentLang + '"]');
    if (metaDesc && currentLang === "zh-CN") metaDesc.setAttribute("content", t("metaDescription"));
    fillText("[data-i18n]", "data-i18n", function (node, text) {
      if (node.classList.contains("brand") && node.querySelector(".brand-name")) return;
      if (node.classList.contains("header-github-hot")) return;
      node.textContent = text;
    });
    var brandSub = document.querySelector(".brand-sub");
    if (brandSub) brandSub.hidden = !String(brandSub.textContent || "").trim();
    var githubHot = document.querySelector(".header-github-hot");
    if (githubHot) {
      var githubLabel = t("githubHotHint");
      githubHot.setAttribute("aria-label", githubLabel);
      githubHot.setAttribute("title", githubLabel);
    }
    applyCountLabels();
    applySearchableCount();
    if (
      !state.loadError &&
      (state.searching || (typeof queryEmpty === "function" && queryEmpty() && !state.categories.size))
    ) {
      hideSearchCount();
    }
    fillText("[data-i18n-placeholder]", "data-i18n-placeholder", function (node, text) {
      node.setAttribute("placeholder", text);
    });
    fillText("[data-i18n-aria]", "data-i18n-aria", function (node, text) {
      node.setAttribute("aria-label", text);
    });
    fillText("[data-i18n-title]", "data-i18n-title", function (node, text) {
      node.setAttribute("title", text);
    });
    syncHomeRankLabel();
    var langToggle = document.getElementById("lang-toggle");
    if (langToggle) {
      var toEnglish = currentLang === "zh-CN";
      langToggle.textContent = toEnglish ? "EN" : "中文";
      langToggle.setAttribute("data-lang", toEnglish ? "en" : "zh-CN");
      langToggle.setAttribute("aria-label", toEnglish ? "Switch to English" : "切换到中文");
      langToggle.setAttribute("title", toEnglish ? "Switch to English" : "切换到中文");
    }
    if (typeof applyTheme === "function") applyTheme(currentTheme(), false);
    if (catModal) {
      catModal.title.textContent = categoryLabel(PAPERS_CATEGORY);
      catModal.close.setAttribute("aria-label", t("modalClose"));
      if (catModal.back) catModal.back.hidden = true;
    }
    // 下载弹窗是动态创建的，标题/副标题、meta 与两行下载按钮都含语言相关文案，
    // 切换语言时若弹窗正开着，需要整块重绘，否则会残留上一种语言的文字。
    if (dlModal && dlModal.book && !dlModal.overlay.hidden) {
      showDownloadSheet(dlModal.book);
    }
    if (!PAPERS_PAGE) retargetHomeCategoryQuery();
    if (state.ready) {
      refreshChips();
      applyFolderLinks();
      if (PAPERS_PAGE && papersBooks.length) paintPapersFilters();
      if (state.loadError) paintChrome();
      else render(true);
    }
    if (!PAPERS_PAGE && pickedSlice.length) paintPickedCards();
    if (!PAPERS_PAGE && !state.ready) paintHomeCategories();
    document.documentElement.removeAttribute("data-i18n-pending");
    syncNarrowHeader();
  }

  // 品牌只显示「书海拾贝」；窄屏时隐藏品牌文字。
  function syncNarrowHeader() {
    var bar = document.querySelector(".topbar-inner");
    if (!bar) return;
    var brand = bar.querySelector(".brand");
    var tools = bar.querySelector(".header-tools");
    if (!brand || !tools) return;
    bar.classList.remove("is-packed");
    bar.classList.remove("is-tight");
    bar.classList.remove("is-min");
    bar.classList.remove("is-short");
    var narrow = window.matchMedia("(max-width: 720px)").matches;
    if (narrow) bar.classList.add("is-packed");
    if (headerTitleOverflows(brand, tools)) bar.classList.add("is-short");
    if (!narrow) return;
    if (headerSpills(brand, tools)) bar.classList.add("is-tight");
    if (headerSpills(brand, tools)) bar.classList.add("is-min");
  }

  function headerTitleOverflows(brand, tools) {
    var text = brand.querySelector(".brand-text") || brand;
    if (text.scrollWidth > text.clientWidth + 1) return true;
    return headerSpills(brand, tools);
  }

  function headerSpills(brand, tools) {
    var title = brand.getBoundingClientRect();
    var controls = tools.getBoundingClientRect();
    var viewRight = document.documentElement.clientWidth;
    return title.right > controls.left - 4 || controls.right > viewRight - 1;
  }

  var libraryTotal = 0;
  var homeBooks = [];
  var homePins = [];
  var shardCache = Object.create(null);
  var shardPromises = Object.create(null);
  var booksById = Object.create(null);
  var catalogBooks = [];
  var catalogKeys = Object.create(null);
  var homeKeys = Object.create(null);
  var querySeq = 0;
  var homeFetchSeq = 0;
  var categoriesFetchSeq = 0;
  var categoriesFetchInFlight = null;
  var collator = null;
  try {
    if (typeof Intl !== "undefined" && Intl.Collator) {
      collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
    }
  } catch (err) {
    collator = null;
  }

  var dom = {
    q: document.getElementById("q"),
    grid: document.getElementById("grid"),
    loading: document.getElementById("loading"),
    countLead: document.getElementById("count-lead"),
    countTotal: document.getElementById("count-total"),
    countMid: document.getElementById("count-mid"),
    countSearch: document.getElementById("count-search"),
    countFilteredLead: document.getElementById("count-filtered-lead"),
    countFiltered: document.getElementById("count-filtered"),
    countTail: document.getElementById("count-tail"),
    empty: document.getElementById("empty"),
    emptyTitle: document.getElementById("empty-title"),
    emptyHint: document.getElementById("empty-hint"),
    emptyReset: document.getElementById("empty-reset"),
    emptyRetry: document.getElementById("empty-retry"),
    loadMore: document.getElementById("load-more"),
    onlyDownloadable: document.getElementById("only-downloadable"),
    clearFilters: document.getElementById("clear-filters"),
    filterCount: document.getElementById("filter-count"),
    categoryChips: document.getElementById("filter-categories"),
    folderLinksGroup: document.getElementById("folder-links-group"),
    folderLinks: document.getElementById("folder-links"),
    rootLink: document.getElementById("root-link"),
    toTop: document.getElementById("to-top"),
    statBooks: document.getElementById("stat-books"),
    statCategories: document.getElementById("stat-categories"),
    statFormats: document.getElementById("stat-formats"),
    statSize: document.getElementById("stat-size"),
    toast: document.getElementById("toast"),
    themeToggle: document.getElementById("theme-toggle"),
    homeRankLabel: document.getElementById("home-rank-label"),
    picked: document.getElementById("picked-papers"),
    pickedGrid: document.getElementById("picked-grid"),
    papersTotal: document.getElementById("papers-total"),
    papersClear: document.getElementById("papers-clear")
  };

  var papersBooks = [];
  var papersMeta = null;
  var papersFeed = null;
  var papersSession = null;
  var papersReq = 0;
  var papersBusy = false;
  var papersPopularCache = null;
  var papersSubjects = new Set();
  var papersYear = "";
  var papersLang = "";
  // 论文搜索走后端 D1（/api/papers）；本地静态预览没有该接口时自动回退到 gram 索引。
  var papersApiMode = false;
  var papersApiPage = 1;
  var papersApiPages = 1;
  var papersApiTotal = 0;
  var papersApiBlocked = false;
  var pickedSlice = [];
  var papersTotal = 0;
  var pickedPaintKey = "";

  var state = {
    ready: false,
    loadError: false,
    tokens: [],
    categories: new Set(),
    onlyDownloadable: false,
    sort: "recommended",
    results: [],
    visible: 0,
    searching: false,
    searchTruncated: false,
    papersMore: false,
    papersMatchTotal: null
  };

  var chipCounts = { categories: [] };
  var toastTimer = null;
  var debounceTimer = null;
  var searchAbort = null;
  var lastRequestedQ = null;
  var lastRequestedHits = [];
  var lastRequestedExtra = null;

  // ==================================================================
  // 数据加载：先绘制推荐书，再按册数从小到大逐个载入分类分片
  // ==================================================================
  function normalizeBook(row) {
    if (!row || typeof row !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(row, "title")) {
      return {
        id: row.id,
        t: row.title || "",
        zh: row.title_zh || "",
        a: row.author || "",
        c: row.category || "",
        s: row.subcategory || "",
        e: row.ext || "",
        z: row.size || 0,
        f: row.filename || "",
        k: row.tags || "",
        l: row.language || "",
        u: downloadField(row.link || row.u),
        q: downloadField(row.quark_link || row.q),
        qp: row.quark_password || row.qp || "",
        pw: row.password || row.pw || "",
        fl: row.scope === "folder" || row.fl ? 1 : 0,
        p: row.uploaded_at || row.p || 0,
        clicks: parseClicks(row.clicks),
        year: row.year || 0
      };
    }
    row.u = downloadField(row.u || row.link);
    row.q = downloadField(row.q || row.quark_link);
    if (!row.qp && row.quark_password) row.qp = row.quark_password;
    return row;
  }

  function foldSearchText(value) {
    return String(value || "").toLocaleLowerCase("en");
  }

  // 分类中英文名称互为别名。查询在切词前先认出整段名称（Selected Papers 不能拆成两个词），
  // 命中时一组里任一写法出现都算这个词命中，因此两种语言搜到的是同一批书。
  var searchAliasPhrases = null;
  var searchAliasOf = null;

  function isSearchSpace(ch) {
    return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f";
  }

  function hasCjk(text) {
    return /[\u3400-\u9fff]/.test(text);
  }

  function ensureSearchAliases() {
    if (searchAliasPhrases) return;
    var parent = Object.create(null);
    function find(node) {
      if (!Object.prototype.hasOwnProperty.call(parent, node)) parent[node] = node;
      var root = node;
      while (parent[root] !== root) root = parent[root];
      while (parent[node] !== node) {
        var next = parent[node];
        parent[node] = root;
        node = next;
      }
      return root;
    }
    function unite(left, right) {
      var a = foldSearchText(left).trim();
      var b = foldSearchText(right).trim();
      if (!a || !b || a === b) return;
      var ra = find(a);
      var rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }
    function addMap(map) {
      var key;
      for (key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) unite(key, map[key]);
      }
    }
    addMap(CATEGORY_LABELS);
    addMap(SUBCATEGORY_LABELS);
    addMap(SUBCATEGORY_EN);
    var grouped = Object.create(null);
    var name;
    for (name in parent) {
      if (!Object.prototype.hasOwnProperty.call(parent, name)) continue;
      var root = find(name);
      if (!grouped[root]) grouped[root] = [];
      grouped[root].push(name);
    }
    searchAliasOf = Object.create(null);
    var phrases = [];
    var rootName;
    for (rootName in grouped) {
      if (!Object.prototype.hasOwnProperty.call(grouped, rootName)) continue;
      var group = grouped[rootName];
      if (group.length < 2) continue;
      var gi;
      for (gi = 0; gi < group.length; gi += 1) {
        searchAliasOf[group[gi]] = group;
        phrases.push(group[gi]);
      }
    }
    phrases.sort(function (a, b) { return b.length - a.length; });
    searchAliasPhrases = phrases;
  }

  function matchAliasPhrase(folded, index) {
    var phrases = searchAliasPhrases;
    var p;
    for (p = 0; p < phrases.length; p += 1) {
      var phrase = phrases[p];
      if (folded.substr(index, phrase.length) !== phrase) continue;
      var end = index + phrase.length;
      if (end < folded.length && !isSearchSpace(folded.charAt(end))) continue;
      return phrase;
    }
    return "";
  }

  function boundedLatin(hay, phrase) {
    var escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9_])" + escaped + "([^a-z0-9_]|$)").test(hay);
  }

  function phraseInHay(hay, phrase) {
    if (!phrase) return false;
    if (hasCjk(phrase) || phrase.indexOf(" ") !== -1) return hay.indexOf(phrase) !== -1;
    return boundedLatin(hay, phrase);
  }

  function searchTokenHits(hay, token) {
    ensureSearchAliases();
    var text = hay || "";
    var group = searchAliasOf && searchAliasOf[token];
    if (!group) return text.indexOf(token) !== -1;
    var i;
    for (i = 0; i < group.length; i += 1) {
      if (phraseInHay(text, group[i])) return true;
    }
    return false;
  }

  function tokenizeQuery(q) {
    ensureSearchAliases();
    var folded = foldSearchText(String(q || "").trim());
    var tokens = [];
    var i = 0;
    var n = folded.length;
    while (i < n) {
      while (i < n && isSearchSpace(folded.charAt(i))) i += 1;
      if (i >= n) break;
      var phrase = matchAliasPhrase(folded, i);
      if (phrase) {
        tokens.push(phrase);
        i += phrase.length;
        continue;
      }
      var j = i;
      while (j < n && !isSearchSpace(folded.charAt(j))) j += 1;
      var token = folded.slice(i, j);
      if (token) tokens.push(token);
      i = j;
    }
    return tokens;
  }

  function indexBook(b) {
    var title = b.t ? String(b.t) : "";
    var titleZh = b.zh ? String(b.zh) : "";
    var author = b.a ? String(b.a) : "";
    var category = b.c ? String(b.c) : "";
    var rest = (b.k || "") + "\n" + (b.f || "") + "\n" + (b.s || "");
    b._title = foldSearchText(title) + "\n" + foldSearchText(titleZh);
    b._author = foldSearchText(author);
    b._category = foldSearchText(category);
    b._sub = foldSearchText(b.s || "");
    b._rest = foldSearchText(rest);
    b._hay = [b._title, b._author, b._category, b._sub].join("\n");
  }

  function rememberBook(book) {
    if (book && book.id != null && book.id !== "") booksById[book.id] = book;
  }

  function adoptList(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i += 1) {
      var book = normalizeBook(raw[i]);
      if (!book || !(book.t || book.zh || book.f)) continue;
      indexBook(book);
      rememberBook(book);
      out.push(book);
    }
    return out;
  }

  function adoptCategoryNode(row) {
    var node = {
      key: row.name || row.key || "未分类",
      count: Number(row.count) || 0,
      empty: !!row.empty
    };
    if (row.search) node.search = row.search;
    var children = [];
    var rawKids = Array.isArray(row.children) ? row.children : [];
    for (var k = 0; k < rawKids.length; k += 1) {
      var kid = adoptCategoryNode(rawKids[k] || {});
      if (!kid.key) continue;
      children.push(kid);
    }
    node.children = children;
    return node;
  }

  function adoptCategories(doc) {
    var rows = doc && Array.isArray(doc.categories) ? doc.categories : [];
    var list = [];
    var sum = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var node = adoptCategoryNode(rows[i] || {});
      sum += node.count;
      list.push(node);
    }
    chipCounts.categories = list;
    libraryTotal = Number(doc && doc.total) || sum;
    buildChipCounts();
  }

  function isFilePage() {
    return typeof location !== "undefined" && location.protocol === "file:";
  }

  function parseClicks(value) {
    var n = parseInt(value, 10);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function clicksLabel(n) {
    return t("clicksTimes").replace("{n}", String(parseClicks(n)));
  }

  function applyClicksToBook(book, n) {
    if (!book) return;
    book.clicks = parseClicks(n);
  }

  function paintCardClicks(card, n) {
    if (!card) return;
    var el = card.querySelector(".card-clicks");
    if (!el) return;
    el.hidden = false;
    el.textContent = clicksLabel(n);
  }

  function setVisibleClicks(id, n) {
    if (isFilePage() || id == null || id === "") return;
    var key = String(id);
    var count = parseClicks(n);
    function touch(book) {
      if (!book) return;
      if (String(book.id) === key || clickBookId(book) === key) {
        applyClicksToBook(book, count);
      }
    }
    var i;
    for (i = 0; i < homeBooks.length; i += 1) touch(homeBooks[i]);
    for (i = 0; i < catalogBooks.length; i += 1) touch(catalogBooks[i]);
    for (i = 0; i < state.results.length; i += 1) touch(state.results[i]);
    if (booksById[key]) applyClicksToBook(booksById[key], count);
    var cards = document.querySelectorAll(".card[data-book-id]");
    for (i = 0; i < cards.length; i += 1) {
      if (cards[i].getAttribute("data-book-id") !== key) continue;
      applyClicksToBook(cards[i]._book, count);
      paintCardClicks(cards[i], count);
    }
  }

  function applyClicksMap(counts) {
    if (!counts || typeof counts !== "object") return;
    var id;
    for (id in counts) {
      if (!Object.prototype.hasOwnProperty.call(counts, id)) continue;
      var incoming = parseClicks(counts[id]);
      var existing = 0;
      if (booksById[id]) existing = parseClicks(booksById[id].clicks);
      setVisibleClicks(id, existing > incoming ? existing : incoming);
    }
  }

  function collectClickIds(books) {
    var ids = [];
    var seen = Object.create(null);
    if (!books) return ids;
    for (var i = 0; i < books.length && ids.length < HOME_LIMIT; i += 1) {
      var id = clickBookId(books[i]);
      if (!id || seen[id]) continue;
      seen[id] = true;
      ids.push(id);
    }
    return ids;
  }

  function fetchClicksMap(books) {
    if (isFilePage() || typeof window.fetch !== "function") {
      return Promise.resolve(null);
    }
    var ids = collectClickIds(books);
    if (!ids.length) return Promise.resolve(null);
    return window
      .fetch("/api/clicks?ids=" + encodeURIComponent(ids.join(",")))
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (doc) {
        if (!doc || !doc.ok || !doc.counts) return null;
        return doc.counts;
      })
      .catch(function () {
        return null;
      });
  }

  function applyClicksToList(books, counts) {
    if (!books || !counts) return;
    for (var i = 0; i < books.length; i += 1) {
      var id = clickBookId(books[i]);
      if (!id || counts[id] == null) continue;
      applyClicksToBook(
        books[i],
        Math.max(parseClicks(books[i].clicks), parseClicks(counts[id]))
      );
    }
  }

  function fetchClicksForBooks(books) {
    fetchClicksMap(books).then(function (counts) {
      if (!counts) return;
      applyClicksMap(counts);
      rerankPaintedHome();
    });
  }

  function fetchJson(url, init) {
    return window.fetch(url, init || {}).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("script failed"));
      };
      document.body.appendChild(script);
    });
  }

  function loadCatalog(url, read, fetchInit) {
    if (!isFilePage()) return fetchJson(url, fetchInit);
    return loadScript(url.replace(/\.json$/, ".js")).then(function () {
      var data = read();
      if (data == null) throw new Error("catalog missing");
      return data;
    });
  }

  function shardUrl(category) {
    return "data/books/" + encodeURI(category) + ".json";
  }

  function loadShard(category, options) {
    var quiet = !!(options && options.quiet);
    if (Object.prototype.hasOwnProperty.call(shardCache, category)) {
      return Promise.resolve(shardCache[category]);
    }
    if (shardPromises[category]) return shardPromises[category];
    var promise = loadCatalog(shardUrl(category), function () {
      return window.EBOOK_SHARDS && window.EBOOK_SHARDS[category];
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error("shard is not an array");
      var books = adoptList(data);
      shardCache[category] = books;
      if (!quiet && absorbShard(books)) {
        try {
          onCatalogGrew();
        } catch (err) {
          if (window.console && console.error) console.error(err);
        }
      }
      return books;
    });
    promise = promise.catch(function (error) {
      delete shardPromises[category];
      throw error;
    });
    shardPromises[category] = promise;
    return promise;
  }

  function bookKey(book) {
    if (!book) return "row:";
    if (book.id != null && book.id !== "") return "id:" + book.id;
    return "row:" + (book.f || "") + "\n" + (book.t || "") + "\n" + (book.c || "") + "\n" + (book.a || "");
  }

  function rememberCatalogBook(book) {
    if (!book) return false;
    var key = bookKey(book);
    if (catalogKeys[key]) {
      for (var i = 0; i < catalogBooks.length; i += 1) {
        if (bookKey(catalogBooks[i]) === key) {
          catalogBooks[i] = book;
          break;
        }
      }
      return false;
    }
    catalogKeys[key] = true;
    catalogBooks.push(book);
    return true;
  }

  function takeHomeSlice(list) {
    return Array.isArray(list) ? list.slice(0, HOME_LIMIT) : [];
  }

  function rankByClicks(list) {
    if (!Array.isArray(list) || list.length < 2) return list || [];
    var decorated = [];
    for (var i = 0; i < list.length; i += 1) {
      var book = list[i];
      var ord = book && book._homeOrd != null ? book._homeOrd : i;
      decorated.push({
        book: book,
        i: ord,
        clicks: parseClicks(book && book.clicks)
      });
    }
    decorated.sort(function (a, b) {
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return a.i - b.i;
    });
    var out = [];
    for (var j = 0; j < decorated.length; j += 1) out.push(decorated[j].book);
    return out;
  }

  function parsePopularRows(doc) {
    var rows = [];
    if (Array.isArray(doc)) rows = doc;
    else if (doc && Array.isArray(doc.books)) rows = doc.books;
    else if (doc && Array.isArray(doc.popular)) rows = doc.popular;
    var out = [];
    for (var i = 0; i < rows.length && out.length < HOME_LIMIT; i += 1) {
      var row = rows[i];
      if (!row || typeof row !== "object") continue;
      if (row.clicks == null && row.count != null) row.clicks = row.count;
      var book = normalizeBook(row);
      if (!book) continue;
      book.clicks = parseClicks(book.clicks);
      if (book.t || book.zh || book.f) {
        indexBook(book);
        rememberBook(book);
        out.push(book);
      } else if (book.id != null && book.id !== "") {
        out.push(book);
      }
    }
    return out;
  }

  function mergeHomeBooks(popular, pins) {
    var pop = Array.isArray(popular) ? popular : [];
    var pinList = Array.isArray(pins) ? pins : [];
    var pinById = Object.create(null);
    var p;
    for (p = 0; p < pinList.length; p += 1) {
      var pinId = clickBookId(pinList[p]);
      if (pinId && !pinById[pinId]) pinById[pinId] = pinList[p];
    }
    var out = [];
    var seen = Object.create(null);
    var i;
    for (i = 0; i < pop.length && out.length < HOME_LIMIT; i += 1) {
      var popBook = pop[i];
      var id = clickBookId(popBook);
      if (id && seen[id]) continue;
      var pin = id ? pinById[id] : null;
      var book = popBook;
      if (!(book.t || book.zh || book.f) && pin) book = pin;
      if (!(book.t || book.zh || book.f)) continue;
      if (pin && book !== pin) overlayDownloadFields(book, pin);
      if (popBook && popBook.clicks != null) {
        applyClicksToBook(book, Math.max(parseClicks(book.clicks), parseClicks(popBook.clicks)));
      }
      if (id) seen[id] = true;
      out.push(book);
    }
    for (p = 0; p < pinList.length && out.length < HOME_LIMIT; p += 1) {
      var extra = pinList[p];
      var extraId = clickBookId(extra);
      if (extraId && seen[extraId]) continue;
      if (extraId) seen[extraId] = true;
      out.push(extra);
    }
    for (i = 0; i < out.length; i += 1) out[i]._homeOrd = i;
    return takeHomeSlice(rankByClicks(out));
  }

  function fetchPopularBooks() {
    if (isFilePage() || typeof window.fetch !== "function") {
      return Promise.resolve([]);
    }
    return window
      .fetch("/api/popular")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (doc) {
        return parsePopularRows(doc);
      })
      .catch(function () {
        return [];
      });
  }

  function rerankPaintedHome() {
    if (isFilePage() || !homeBrowse() || !state.ready || state.loadError) return;
    var ranked = rankByClicks(homeBooks.slice());
    var changed = ranked.length !== homeBooks.length;
    var r;
    if (!changed) {
      for (r = 0; r < ranked.length; r += 1) {
        if (ranked[r] !== homeBooks[r]) {
          changed = true;
          break;
        }
      }
    }
    homeBooks = ranked;
    writeHomeCache(ranked);
    if (!changed) return;
    paintHomeGridSilent();
  }

  function homeOrderChanged(prev, next) {
    if (!prev || !next || prev.length !== next.length) return true;
    for (var i = 0; i < prev.length; i += 1) {
      if (clickBookId(prev[i]) !== clickBookId(next[i])) return true;
    }
    return false;
  }

  function replaceGridCards(books) {
    if (!dom.grid) return;
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < books.length; i += 1) {
      fragment.appendChild(buildCard(books[i]));
    }
    if (typeof dom.grid.replaceChildren === "function") {
      dom.grid.replaceChildren(fragment);
    } else {
      while (dom.grid.firstChild) dom.grid.removeChild(dom.grid.firstChild);
      if (fragment.childNodes.length) dom.grid.appendChild(fragment);
    }
  }

  function paintHomeGridSilent() {
    if (!homeBrowse() || !state.ready || state.loadError) return;
    var homeList = applyLocalFilters(homeBooks.slice(), state.sort === "recommended");
    state.searching = false;
    state.searchTruncated = false;
    if (dom.loading) dom.loading.hidden = true;
    replaceGridCards(homeList);
    state.results = homeList;
    state.visible = homeList.length;
    paintChrome();
  }

  function refreshHomeRankedAfterClick() {
    if (isFilePage() || typeof window.fetch !== "function") return;
    var pins = homePins.length ? homePins : homeBooks.slice();
    fetchPopularBooks()
      .then(function (popular) {
        var merged = mergeHomeBooks(popular, pins);
        return fetchClicksMap(merged).then(function (counts) {
          if (counts) {
            applyClicksMap(counts);
            applyClicksToList(merged, counts);
            for (var i = 0; i < merged.length; i += 1) {
              merged[i]._homeOrd = merged[i]._homeOrd != null ? merged[i]._homeOrd : i;
            }
            merged = takeHomeSlice(rankByClicks(merged));
          }
          return merged;
        });
      })
      .then(function (slice) {
        if (!slice || !slice.length) return;
        var prev = homeBooks.slice();
        installHomeSlice(slice, true);
        if (!homeBrowse()) return;
        if (homeOrderChanged(prev, homeBooks)) {
          paintHomeGridSilent();
          return;
        }
        var cards = document.querySelectorAll(".card[data-book-id]");
        for (var c = 0; c < cards.length; c += 1) {
          var book = cards[c]._book;
          if (!book) continue;
          paintCardClicks(cards[c], parseClicks(book.clicks));
        }
      })
      .catch(function () {});
  }

  function cacheableHomeBook(book) {
    if (!book) return null;
    return {
      id: book.id,
      t: book.t || "",
      zh: book.zh || "",
      a: book.a || "",
      c: book.c || "",
      s: book.s || "",
      e: book.e || "",
      z: book.z || 0,
      f: book.f || "",
      k: book.k || "",
      l: book.l || "",
      u: book.u || "",
      q: book.q || "",
      qp: book.qp || "",
      pw: book.pw || "",
      fl: book.fl || 0,
      p: book.p || 0,
      clicks: parseClicks(book.clicks)
    };
  }

  function readHomeCache() {
    try {
      var raw = localStorage.getItem(HOME_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== HOME_CACHE_VERSION || !Array.isArray(parsed.books)) return null;
      var rows = parsed.books;
      if (!rows.length) return null;
      var books = adoptList(rows);
      return books.length ? takeHomeSlice(rankByClicks(books)) : null;
    } catch (err) {
      return null;
    }
  }

  function writeHomeCache(books) {
    try {
      var out = [];
      var list = takeHomeSlice(books);
      for (var i = 0; i < list.length; i += 1) {
        var row = cacheableHomeBook(list[i]);
        if (row) out.push(row);
      }
      if (!out.length) return;
      localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ v: HOME_CACHE_VERSION, books: out }));
    } catch (err) {}
  }

  function readCategoriesCache() {
    try {
      var raw = localStorage.getItem(CATEGORIES_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== CATEGORIES_CACHE_VERSION) return null;
      var doc = parsed.doc;
      if (!doc || !Array.isArray(doc.categories) || !doc.categories.length) return null;
      return doc;
    } catch (err) {
      return null;
    }
  }

  function writeCategoriesCache(doc) {
    try {
      if (!doc || !Array.isArray(doc.categories) || !doc.categories.length) return;
      localStorage.setItem(
        CATEGORIES_CACHE_KEY,
        JSON.stringify({ v: CATEGORIES_CACHE_VERSION, doc: doc })
      );
    } catch (err) {}
  }

  function categoryModalIsOpen() {
    return !!(catModal && catModal.overlay && !catModal.overlay.hidden);
  }

  function rematchCatModalStack() {
    if (!catModalStack.length) return;
    var keys = [];
    for (var i = 0; i < catModalStack.length; i += 1) keys.push(catModalStack[i].key);
    var next = [];
    var parent = null;
    for (var k = 0; k < keys.length; k += 1) {
      var node = findCategoryChild(parent, keys[k]);
      if (!node) break;
      next.push(node);
      parent = node;
    }
    catModalStack = next;
  }

  function installCategories(doc, persistCache) {
    if (!doc || !Array.isArray(doc.categories) || !doc.categories.length) return false;
    adoptCategories(doc);
    if (persistCache) writeCategoriesCache(doc);
    var rewritten = !PAPERS_PAGE && retargetHomeCategoryQuery();
    rematchCatModalStack();
    refreshChips();
    if (PAPERS_PAGE && papersBooks.length) paintPapersFilters();
    if (rewritten && state.ready) render(true);
    return true;
  }

  function fetchCategoriesCatalog() {
    if (categoriesFetchInFlight) return categoriesFetchInFlight;
    var seq = ++categoriesFetchSeq;
    var categoriesUrl = isFilePage()
      ? "data/categories.json"
      : "data/categories.json?v=" + CATEGORIES_CACHE_VERSION;
    var job = loadCatalog(
      categoriesUrl,
      function () {
        return window.EBOOK_CATEGORIES;
      },
      { cache: "no-store" }
    )
      .then(function (doc) {
        if (seq !== categoriesFetchSeq) return;
        if (!installCategories(doc, true)) throw new Error("categories catalog invalid");
      })
      .catch(function (error) {
        if (seq !== categoriesFetchSeq) return;
        if (chipCounts.categories.length) {
          if (window.console && console.error) console.error(error);
        }
      });
    categoriesFetchInFlight = job.then(function () {
      categoriesFetchInFlight = null;
    });
    return job;
  }

  function installHomeSlice(allAdopted, persistCache) {
    var slice = takeHomeSlice(allAdopted);
    homeBooks = slice;
    homeKeys = Object.create(null);
    for (var i = 0; i < slice.length; i += 1) {
      homeKeys[bookKey(slice[i])] = true;
    }
    if (!catalogBooks.length) seedCatalog(slice);
    else {
      for (var h = 0; h < slice.length; h += 1) rememberCatalogBook(slice[h]);
    }
    if (allAdopted && allAdopted.length > slice.length) absorbShard(allAdopted);
    if (persistCache) writeHomeCache(slice);
    return slice;
  }

  function seedCatalog(books) {
    catalogBooks = [];
    catalogKeys = Object.create(null);
    homeKeys = Object.create(null);
    for (var i = 0; i < books.length; i += 1) {
      if (!rememberCatalogBook(books[i])) continue;
      homeKeys[bookKey(books[i])] = true;
    }
  }

  function absorbShard(books) {
    var added = false;
    for (var i = 0; i < books.length; i += 1) {
      if (rememberCatalogBook(books[i])) added = true;
    }
    return added;
  }

  function entryMatches(entry, tokens) {
    var hay = entry && entry._hay ? entry._hay : "";
    for (var i = 0; i < tokens.length; i += 1) {
      if (!searchTokenHits(hay, tokens[i])) return false;
    }
    return true;
  }

  function paintHomeCatalog() {
    afterDataLoaded();
  }

  function fetchHomeCatalog() {
    var seq = ++homeFetchSeq;
    if (!isFilePage() && typeof window.fetch !== "function") {
      if (!homeBooks.length) showLoadError(new Error("fetch unavailable"));
      return;
    }

    var filePage = isFilePage();
    var jobs = [
      loadCatalog("data/home.json", function () {
        return window.EBOOK_HOME;
      })
    ];
    if (!filePage) jobs.push(fetchPopularBooks());
    fetchCategoriesCatalog();

    Promise.all(jobs)
      .then(function (pair) {
        if (seq !== homeFetchSeq) return;
        var home = pair[0];
        if (!Array.isArray(home)) throw new Error("home catalog is not an array");
        var pins = adoptList(home);
        homePins = pins;
        var slice = filePage ? takeHomeSlice(pins) : mergeHomeBooks(pair[1] || [], pins);
        installHomeSlice(slice, true);
        applySearchableCount();
        paintHomeCatalog();
      })
      .catch(function (error) {
        if (seq !== homeFetchSeq) return;
        if (homeBooks.length || !queryEmpty()) {
          if (window.console && console.error) console.error(error);
          return;
        }
        showLoadError(error);
      });
  }

  function formatCount(n) {
    var value = Number(n) || 0;
    try {
      return value.toLocaleString(currentLang === "zh-CN" ? "zh-CN" : "en-US");
    } catch (err) {
      return String(value);
    }
  }

  function papersCategoryNode() {
    var list = chipCounts.categories || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].key === PAPERS_CATEGORY) return list[i];
    }
    return null;
  }

  function papersIncludedCount() {
    if (papersMeta && papersMeta.total != null) return papersMeta.total;
    var node = papersCategoryNode();
    if (node && node.count) return node.count;
    return papersBooks.length;
  }

  function writePapersTotal() {
    papersTotal = papersIncludedCount();
    if (dom.papersTotal) dom.papersTotal.textContent = formatCount(papersTotal);
  }

  function stampPaperOrder(books) {
    for (var i = 0; i < books.length; i += 1) {
      if (books[i] && books[i]._homeOrd == null) books[i]._homeOrd = i;
    }
  }

  function applyPopularToPapers(books, popular) {
    var map = Object.create(null);
    var list = Array.isArray(popular) ? popular : [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || (row.c || "") !== PAPERS_CATEGORY) continue;
      var id = clickBookId(row);
      if (!id) continue;
      map[id] = parseClicks(row.clicks);
    }
    for (var j = 0; j < books.length; j += 1) {
      var book = books[j];
      var bookId = clickBookId(book);
      if (bookId && map[bookId] != null) {
        applyClicksToBook(book, Math.max(parseClicks(book.clicks), map[bookId]));
      }
    }
  }

  function rankPaperList(books) {
    stampPaperOrder(books);
    return rankByClicks(books.slice());
  }

  function papersFilterActive() {
    return !queryEmpty() || papersSubjects.size > 0 || !!papersYear;
  }

  function papersYearList() {
    return papersYear ? [Number(papersYear)] : [];
  }

  function setPapersYearOpen(open) {
    var root = document.getElementById("papers-year");
    var button = document.getElementById("papers-year-btn");
    var menu = document.getElementById("papers-year-menu");
    if (!root || !button || !menu) return;
    root.classList.toggle("is-open", !!open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
    menu.hidden = !open;
  }

  function paintPapersYearMenu(metaYears) {
    var label = document.getElementById("papers-year-label");
    var menu = document.getElementById("papers-year-menu");
    if (!label || !menu) return;
    label.textContent = papersYear ? String(papersYear) : t("papersYearAll");
    menu.textContent = "";
    function option(value, text, count, selected) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "papers-year-option";
      button.setAttribute("role", "option");
      button.dataset.value = value;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      var name = document.createElement("span");
      name.textContent = text;
      button.appendChild(name);
      if (count != null) {
        var num = document.createElement("span");
        num.className = "chip-count";
        num.textContent = formatCount(count);
        button.appendChild(num);
      }
      return button;
    }
    menu.appendChild(option("", t("papersYearAll"), null, !papersYear));
    var years = metaYears || [];
    for (var i = 0; i < years.length; i += 1) {
      var entry = years[i];
      if (!entry || !entry.year) continue;
      var value = String(entry.year);
      menu.appendChild(option(value, value, entry.count || 0, papersYear === value));
    }
  }

  function filterPapers(books) {
    var tokens = state.tokens || [];
    var out = [];
    for (var i = 0; i < books.length; i += 1) {
      var book = books[i];
      if (!book) continue;
      if (book.c && book.c !== PAPERS_CATEGORY) continue;
      if (papersSubjects.size && !papersSubjects.has(String(book.s || ""))) continue;
      if (papersYear && Number(book.year) !== Number(papersYear)) continue;
      if (tokens.length && !entryMatches(book, tokens)) continue;
      out.push(book);
    }
    return out;
  }

  function subjectEntries() {
    if (papersMeta && papersMeta.subjects && papersMeta.subjects.length) {
      var fromMeta = [];
      for (var m = 0; m < papersMeta.subjects.length; m += 1) {
        var item = papersMeta.subjects[m];
        if (!item || !item.key) continue;
        fromMeta.push({ key: item.key, count: item.count || 0 });
      }
      if (fromMeta.length) return fromMeta;
    }
    var node = papersCategoryNode();
    if (node && node.children && node.children.length) {
      var fromTree = [];
      for (var i = 0; i < node.children.length; i += 1) {
        var kid = node.children[i];
        if (!kid || !kid.key) continue;
        fromTree.push({ key: kid.key, count: kid.count || 0 });
      }
      if (fromTree.length) return fromTree;
    }
    var counts = Object.create(null);
    var order = [];
    for (var j = 0; j < papersBooks.length; j += 1) {
      var key = String(papersBooks[j].s || "");
      if (!key) continue;
      if (!counts[key]) {
        counts[key] = 0;
        order.push(key);
      }
      counts[key] += 1;
    }
    order.sort(function (a, b) {
      return counts[b] - counts[a];
    });
    var derived = [];
    for (var k = 0; k < order.length; k += 1) {
      derived.push({ key: order[k], count: counts[order[k]] });
    }
    return derived;
  }

  function languageCounts() {
    var counts = { ZH: 0, EN: 0, OTHER: 0 };
    for (var i = 0; i < papersBooks.length; i += 1) {
      var code = languageOf(papersBooks[i]);
      if (!counts[code]) counts[code] = 0;
      counts[code] += 1;
    }
    return counts;
  }

  function isIdleCategory(key) {
    return key === "其他" || key === "Other";
  }

  function staticCategoryChip(label, countText, value) {
    var chip = document.createElement("span");
    chip.className = "chip chip-static";
    chip.dataset.value = value || "";
    chip.setAttribute("aria-disabled", "true");
    var text = document.createElement("span");
    text.className = "chip-text";
    text.textContent = label;
    var num = document.createElement("span");
    num.className = "chip-count";
    num.textContent = countText;
    chip.appendChild(text);
    chip.appendChild(num);
    return chip;
  }

  function fillChip(button, label, count, pressed) {
    button.className = "chip" + (pressed ? " active" : "");
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    var text = document.createElement("span");
    text.className = "chip-text";
    text.textContent = label;
    var num = document.createElement("span");
    num.className = "chip-count";
    num.textContent = formatCount(count);
    button.appendChild(text);
    button.appendChild(num);
  }

  function paintPapersFilters() {
    writePapersTotal();
    var subjectBox = document.getElementById("papers-subjects");
    if (subjectBox) {
      subjectBox.textContent = "";
      var subjects = subjectEntries();
      for (var i = 0; i < subjects.length; i += 1) {
        var entry = subjects[i];
        if (isIdleCategory(entry.key)) {
          papersSubjects.delete(entry.key);
          subjectBox.appendChild(staticCategoryChip(subcategoryLabel(entry.key), formatCount(entry.count), entry.key));
          continue;
        }
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.value = entry.key;
        fillChip(button, subcategoryLabel(entry.key), entry.count, papersSubjects.has(entry.key));
        subjectBox.appendChild(button);
      }
    }
    paintPapersYearMenu(papersMeta && papersMeta.years);
    if (dom.papersClear) {
      dom.papersClear.disabled = !papersSubjects.size && !papersYear;
    }
    syncPapersFilterButton();
  }

  function paintPapersChrome() {
    var shown = state.results.length;
    var pager = document.getElementById("papers-pager");
    if (pager && (state.searching || !papersApiMode)) pager.hidden = true;
    var filtered = state.papersMatchTotal != null ? state.papersMatchTotal : shown;
    var hasResults = shown > 0;
    writePapersTotal();
    if (state.searching) {
      if (dom.empty) dom.empty.hidden = true;
      if (dom.loadMore) dom.loadMore.hidden = true;
      if (dom.countSearch) dom.countSearch.hidden = true;
      return;
    }
    if (dom.empty) dom.empty.hidden = hasResults;
    if (!hasResults && dom.emptyTitle && dom.emptyHint) {
      if (state.loadError) {
        dom.emptyTitle.textContent = t("loadErrorTitle");
        var loadHint = t("loadErrorHint");
        dom.emptyHint.textContent = loadHint;
        dom.emptyHint.hidden = !loadHint;
      } else {
        dom.emptyTitle.textContent = t("emptyTitle");
        dom.emptyHint.textContent = t("papersEmptyHint");
        dom.emptyHint.hidden = false;
      }
      if (dom.emptyReset) dom.emptyReset.hidden = !!state.loadError;
      if (dom.emptyRetry) dom.emptyRetry.hidden = !state.loadError;
    } else if (dom.emptyRetry) {
      dom.emptyRetry.hidden = true;
    }
    var showMatches = papersFilterActive() && !state.loadError;
    var toolbar = document.querySelector(".toolbar");
    if (toolbar) toolbar.hidden = !showMatches;
    if (dom.countSearch) dom.countSearch.hidden = !showMatches;
    if (showMatches) {
      if (dom.countFilteredLead) {
        dom.countFilteredLead.removeAttribute("data-i18n");
        dom.countFilteredLead.textContent = t("papersMatchesLead");
      }
      if (dom.countFiltered) {
        var matchLabel = formatCount(filtered);
        if (state.papersMatchTotal == null && state.papersMore) matchLabel += "+";
        dom.countFiltered.textContent = matchLabel;
      }
      if (dom.countTail) {
        dom.countTail.removeAttribute("data-i18n");
        dom.countTail.textContent = t("papersMatchesTail");
      }
    }
    if (dom.loadMore) {
      var allowMore = false;
      if (hasResults) {
        if (state.papersMatchTotal != null) allowMore = state.visible < state.papersMatchTotal;
        else allowMore = !!state.papersMore;
      }
      dom.loadMore.hidden = !allowMore;
      if (allowMore) {
        if (state.papersMatchTotal != null) {
          dom.loadMore.textContent = t("loadMoreLeft").replace(
            "{n}",
            String(Math.max(0, state.papersMatchTotal - state.visible))
          );
        } else {
          dom.loadMore.textContent = t("loadMore");
        }
      }
    }
    if (pager) {
      var showPager = papersApiMode && !state.searching && shown > 0;
      pager.hidden = !showPager;
      if (showPager) {
        var pageInfo = document.getElementById("papers-page-info");
        if (pageInfo) {
          pageInfo.textContent = t("papersPageInfo")
            .replace("{page}", String(papersApiPage))
            .replace("{pages}", String(papersApiPages));
        }
        var prev = document.getElementById("papers-prev");
        var next = document.getElementById("papers-next");
        if (prev) prev.disabled = papersApiPage <= 1;
        if (next) next.disabled = papersApiPage >= papersApiPages;
        if (dom.loadMore) dom.loadMore.hidden = true;
      }
    }
  }

  function papersSubjectList() {
    var out = [];
    papersSubjects.forEach(function (key) { out.push(key); });
    return out;
  }

  function papersFetch(url) {
    return window.fetch(url).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  function ensurePapersFeed() {
    if (papersFeed) return papersFeed;
    if (!window.PapersFeed) throw new Error("papers feed missing");
    papersFeed = window.PapersFeed.createPapersFeed({
      // 线上用合并块（10 页/块），本地 file:// 仍读逐页 .js。
      base: "data/papers/",
      fetchJson: papersFetch,
      prepare: function (row) {
        var book = normalizeBook(row);
        if (!book || !(book.t || book.zh || book.f)) return null;
        if (row && row.ord != null) book.ord = row.ord;
        indexBook(book);
        rememberBook(book);
        return book;
      },
      matches: function (book, tokens) {
        return entryMatches(book, tokens);
      },
      tokenAlts: function (token) {
        ensureSearchAliases();
        var group = searchAliasOf && searchAliasOf[token];
        if (!group || !group.length) return [token];
        return group;
      }
    });
    return papersFeed;
  }

  function papersPrefer() {
    if (isFilePage() || typeof window.fetch !== "function") return Promise.resolve([]);
    if (papersPopularCache) return Promise.resolve(papersPopularCache);
    return fetchPopularBooks().then(function (rows) {
      var out = [];
      var list = rows || [];
      var i;
      for (i = 0; i < list.length; i += 1) {
        if (list[i] && (list[i].c || "") === PAPERS_CATEGORY) out.push(list[i]);
      }
      papersPopularCache = rankByClicks(out);
      return papersPopularCache;
    });
  }

  function showPaperBatch(books, more, total, reset) {
    state.searching = false;
    state.loadError = false;
    state.papersMore = !!more;
    state.papersMatchTotal = total == null ? null : total;
    if (dom.loading) dom.loading.hidden = true;
    if (reset) {
      state.results = books.slice();
      state.visible = 0;
      if (dom.grid) dom.grid.textContent = "";
    } else {
      var i;
      for (i = 0; i < books.length; i += 1) state.results.push(books[i]);
    }
    paintCount(state.results.length);
    paintPapersChrome();
  }

  function refreshPaperClicks(seq) {
    if (isFilePage() || papersFilterActive() || state.results.length > PAGE_SIZE) return;
    var slice = state.results.slice(0, PAGE_SIZE);
    refreshRankedPaperClicks(slice, function () {
      if (seq !== papersReq || papersFilterActive() || state.results.length > PAGE_SIZE) return;
      var ranked = rankByClicks(state.results.slice());
      var changed = ranked.length !== state.results.length;
      var i;
      if (!changed) {
        for (i = 0; i < ranked.length; i += 1) {
          if (ranked[i] !== state.results[i]) changed = true;
        }
      }
      if (!changed) {
        paintPapersChrome();
        return;
      }
      state.results = ranked;
      state.visible = 0;
      if (dom.grid) dom.grid.textContent = "";
      paintCount(ranked.length);
      paintPapersChrome();
    });
  }

  // API 模式下不再加载 data/papers/page/0.json，只取一份轻量 meta 填学科/年份筛选。
  function ensurePapersMeta() {
    if (papersMeta) return Promise.resolve(papersMeta);
    if (isFilePage() || typeof window.fetch !== "function") return Promise.resolve(null);
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller && typeof setTimeout === "function") {
      timer = setTimeout(function () {
        controller.abort();
      }, 5000);
    }
    function finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    return window
      .fetch("data/papers-meta.json?v=" + CATEGORIES_CACHE_VERSION, {
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (doc) {
        finish();
        if (doc && Array.isArray(doc.subjects)) {
          papersMeta = doc;
          paintPapersFilters();
        }
        return doc;
      })
      .catch(function () {
        finish();
        // 读不到轻量 meta 时也不要退回旧分片统计。
        if (!papersMeta) {
          papersMeta = {
            total: 128199,
            page_size: 20,
            pages: 6410,
            subjects: [],
            years: []
          };
          paintPapersFilters();
        }
        return papersMeta;
      });
  }

  function papersBackendQuery(page) {
    var params = new URLSearchParams();
    var q = queryValue().trim();
    if (q) params.set("q", q);
    var subjects = papersSubjectList();
    if (subjects.length) params.set("subjects", subjects.join(","));
    if (papersYear) params.set("year", String(papersYear));
    params.set("page", String(page));
    params.set("size", String(PAGE_SIZE));
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller && typeof setTimeout === "function") {
      timer = setTimeout(function () {
        controller.abort();
      }, 8000);
    }
    function finish() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    return window
      .fetch("api/papers?" + params.toString(), {
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      })
      .then(function (response) {
        if (!response.ok) {
          var error = new Error("HTTP " + response.status);
          error.status = response.status;
          throw error;
        }
        return response.json();
      })
      .then(function (doc) {
        if (!doc || !doc.ok) {
          var error = new Error("papers API failed");
          error.status = 503;
          throw error;
        }
        finish();
        return doc;
      })
      .catch(function (error) {
        finish();
        throw error;
      });
  }

  function papersBackendBooks(doc) {
    var out = [];
    var rows = doc && Array.isArray(doc.books) ? doc.books : [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!row) continue;
      if (!row.category) row.category = PAPERS_CATEGORY;
      var book = normalizeBook(row);
      if (!book || !(book.t || book.zh || book.f)) continue;
      indexBook(book);
      rememberBook(book);
      out.push(book);
    }
    return out;
  }

  function runPapersFeedQuery(seq, tokens) {
    var feed;
    try {
      feed = ensurePapersFeed();
    } catch (error) {
      showLoadError(error);
      return;
    }
    papersPrefer().then(function (prefer) {
      if (seq !== papersReq) return null;
      return feed.load().then(function (doc) {
        papersMeta = doc;
        paintPapersFilters();
        if (seq !== papersReq) return null;
        papersSession = feed.open({
          tokens: tokens,
          subjects: papersSubjectList(),
          years: papersYearList(),
          prefer: prefer || []
        });
        return papersSession.next();
      });
    }).then(function (page) {
      if (seq !== papersReq || !page) return;
      state.ready = true;
      showPaperBatch(page.books || [], page.more, page.total, true);
      if (!tokens.length && !papersSubjects.size && !papersYear) refreshPaperClicks(seq);
    }).catch(function (error) {
      if (seq !== papersReq) return;
      showLoadError(error);
    });
  }

  function openPapersQuery() {
    var seq = ++papersReq;
    var tokens = tokenizeQuery(queryValue());
    state.tokens = tokens;
    state.searching = true;
    state.loadError = false;
    state.results = [];
    state.visible = 0;
    state.papersMore = false;
    if (dom.grid) dom.grid.textContent = "";
    if (dom.empty) dom.empty.hidden = true;
    if (dom.loadMore) dom.loadMore.hidden = true;
    if (dom.loading) {
      dom.loading.hidden = false;
      dom.loading.textContent = tokens.length ? t("searching") : t("loading");
    }

    // 论文页改回纯静态块读取（不依赖 D1 行读额度）；
    // /api/papers 代码保留，将来需要后端搜索时把这里改回条件即可。
    var useApi = false;
    if (!useApi) {
      papersApiMode = false;
      runPapersFeedQuery(seq, tokens);
      return;
    }

    papersApiMode = true;
    ensurePapersMeta().then(function () {
      if (seq !== papersReq) return null;
      return papersBackendQuery(1);
    }).then(function (doc) {
      if (seq !== papersReq || !doc) return;
      papersApiPage = doc.page || 1;
      papersApiPages = doc.pages || 1;
      papersApiTotal = doc.total || 0;
      state.ready = true;
      showPaperBatch(
        papersBackendBooks(doc),
        papersApiPage < papersApiPages,
        papersApiTotal,
        true
      );
      paintPapersChrome();
    }).catch(function (error) {
      if (seq !== papersReq) return;
      // 只有接口不存在（本地静态预览）才回退旧索引；5xx/429 不能回退，
      // 否则会读到缓存的旧 meta（总数变回 11,056）且年份筛选必然无结果。
      if (error && error.status === 404) {
        papersApiBlocked = true;
        papersApiMode = false;
        runPapersFeedQuery(seq, tokens);
        return;
      }
      papersApiMode = false;
      showLoadError(error);
      paintPapersChrome();
    });
  }

  function gotoPaperPage(page) {
    if (!papersApiMode || papersBusy) return;
    if (page < 1 || page > papersApiPages || page === papersApiPage) return;
    var seq = papersReq;
    papersBusy = true;
    papersBackendQuery(page).then(function (doc) {
      papersBusy = false;
      if (seq !== papersReq) return;
      papersApiPage = doc.page || page;
      papersApiPages = doc.pages || 1;
      papersApiTotal = doc.total || 0;
      showPaperBatch(
        papersBackendBooks(doc),
        papersApiPage < papersApiPages,
        papersApiTotal,
        true
      );
      paintPapersChrome();
      if (dom.grid && dom.grid.scrollIntoView) {
        try {
          dom.grid.scrollIntoView({ block: "start", behavior: "smooth" });
        } catch (err) {
          dom.grid.scrollIntoView();
        }
      }
    }).catch(function (error) {
      papersBusy = false;
      if (seq !== papersReq) return;
      showLoadError(error);
    });
  }

  function morePapers() {
    if (papersApiMode) {
      gotoPaperPage(papersApiPage + 1);
      return;
    }
    if (!papersSession || papersBusy || !state.papersMore) return;
    var seq = papersReq;
    papersBusy = true;
    papersSession.next().then(function (page) {
      papersBusy = false;
      if (seq !== papersReq || !page) return;
      showPaperBatch(page.books || [], page.more, page.total, false);
    }).catch(function (error) {
      papersBusy = false;
      if (seq !== papersReq) return;
      showLoadError(error);
    });
  }

  function renderPapers(reset) {
    if (!reset) {
      morePapers();
      return;
    }
    openPapersQuery();
  }

  function syncPickedVisibility() {
    if (!dom.picked) return;
    var show =
      !PAPERS_PAGE &&
      homeBrowse() &&
      !state.searching &&
      pickedSlice.length > 0;
    dom.picked.hidden = !show;
  }

  function paintPickedCards() {
    if (!dom.pickedGrid) return;
    syncPickedVisibility();
    if (!dom.picked || dom.picked.hidden) return;
    var parts = [currentLang];
    for (var i = 0; i < pickedSlice.length; i += 1) {
      parts.push(clickBookId(pickedSlice[i]) + ":" + parseClicks(pickedSlice[i].clicks));
    }
    var key = parts.join(",");
    if (key === pickedPaintKey && dom.pickedGrid.childNodes.length) return;
    pickedPaintKey = key;
    var fragment = document.createDocumentFragment();
    for (var j = 0; j < pickedSlice.length; j += 1) {
      fragment.appendChild(buildCard(pickedSlice[j]));
    }
    if (typeof dom.pickedGrid.replaceChildren === "function") {
      dom.pickedGrid.replaceChildren(fragment);
    } else {
      dom.pickedGrid.textContent = "";
      dom.pickedGrid.appendChild(fragment);
    }
  }

  function refreshRankedPaperClicks(slice, done) {
    fetchClicksMap(slice).then(function (counts) {
      if (counts) {
        applyClicksToList(slice, counts);
        applyClicksToList(papersBooks, counts);
      }
      if (done) done(counts);
    });
  }

  function loadPickedPapers() {
    if (!dom.picked || PAPERS_PAGE) return;
    var jobs = [loadShard(PAPERS_CATEGORY, { quiet: true })];
    if (!isFilePage()) jobs.push(fetchPopularBooks());
    Promise.all(jobs)
      .then(function (pair) {
        var books = pair[0] || [];
        stampPaperOrder(books);
        applyPopularToPapers(books, pair[1] || []);
        papersBooks = books;
        pickedSlice = rankPaperList(books).slice(0, HOME_LIMIT);
        pickedPaintKey = "";
        paintPickedCards();
        refreshRankedPaperClicks(pickedSlice, function () {
          pickedSlice = rankByClicks(pickedSlice.slice());
          pickedPaintKey = "";
          paintPickedCards();
        });
      })
      .catch(function () {
        if (dom.picked) dom.picked.hidden = true;
      });
  }

  function loadPapersPage() {
    state.loadError = false;
    papersApiBlocked = false;
    if (dom.loading) {
      dom.loading.hidden = false;
      dom.loading.textContent = t("loading");
    }
    openPapersQuery();
  }

  function loadData() {
    if (PAPERS_PAGE) {
      loadPapersPage();
      return;
    }
    var cachedCats = readCategoriesCache();
    if (cachedCats) installCategories(cachedCats, false);
    var cached = readHomeCache();
    if (cached && cached.length) {
      installHomeSlice(cached, false);
      paintHomeCatalog();
    } else if (dom.loading) {
      dom.loading.hidden = false;
    }
    fetchHomeCatalog();
  }

  function afterDataLoaded() {
    if (dom.loading) dom.loading.hidden = true;
    state.loadError = false;
    refreshChips();
    applyFolderLinks();
    updateStats();
    applySearchableCount();
    state.ready = true;
    render(true);
  }

  function showLoadError(error) {
    state.searching = false;
    if (dom.loading) dom.loading.hidden = true;
    state.loadError = true;
    state.ready = true;
    state.results = [];
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintPage();
    if (window.console && console.error) console.error(error);
  }

  function retryFailedRequest() {
    if (PAPERS_PAGE) {
      state.loadError = false;
      showLoadPending(false);
      loadPapersPage();
      return;
    }
    if (queryEmpty()) {
      querySeq += 1;
      showLoadPending(false);
      fetchHomeCatalog();
      return;
    }
    requestResults();
  }

  function categoryOf(book) {
    return book.c || "未分类";
  }

  function formatOf(book) {
    return book.e ? String(book.e).toLowerCase() : "unknown";
  }

  function languageOf(book) {
    var code = String(book.l || book.language || "").toUpperCase();
    if (code === "ZH" || code === "中文") return "ZH";
    if (code === "EN" || code === "英文") return "EN";
    if (code === "OTHER" || code === "其他") return "OTHER";
    // 旧数据没有语言字段时的兜底：精选论文保持英文，不看中文译名。
    if ((book.c || "") === "精选论文") return "EN";
    var title = String(book.t || "");
    var cjk = (title.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjk >= 2) return "ZH";
    return "EN";
  }

  function languageLabel(code) {
    if (code === "ZH") return t("langZh");
    if (code === "OTHER") return t("langOther");
    return t("langEn");
  }

  // 分类 -> 图标 / 主色（用于分类卡片与书籍封面占位）
  var CATEGORY_META = {
    "编程开发": { icon: "💻", c1: "#475569", c2: "#64748b" },
    "统计与数据科学": { icon: "📊", c1: "#0e7490", c2: "#0f766e" },
    "教材教辅": { icon: "🎓", c1: "#b45309", c2: "#d97706" },
    "历史与社会": { icon: "🏛️", c1: "#92400e", c2: "#b45309" },
    "人文社科": { icon: "🧠", c1: "#7c2d12", c2: "#9a3412" },
    "中国古典文学": { icon: "📜", c1: "#713f12", c2: "#a16207" },
    "中国现当代文学": { icon: "📖", c1: "#9f1239", c2: "#be123c" },
    "世界文学": { icon: "🌏", c1: "#1e3a8a", c2: "#2563eb" },
    "世界文学·小说": { icon: "📕", c1: "#1e40af", c2: "#2563eb" },
    "世界文学·诗歌": { icon: "🪶", c1: "#5b21b6", c2: "#7c3aed" },
    "世界文学·戏剧": { icon: "🎭", c1: "#7c2d12", c2: "#9a3412" },
    "世界文学·散文": { icon: "✒️", c1: "#854d0e", c2: "#a16207" },
    "世界文学·儿童": { icon: "🧸", c1: "#0369a1", c2: "#0284c7" },
    "世界文学·传记": { icon: "🖋️", c1: "#7f1d1d", c2: "#991b1b" },
    "世界文学·历史": { icon: "🏛️", c1: "#92400e", c2: "#b45309" },
    "世界文学·科普": { icon: "🔭", c1: "#075985", c2: "#0369a1" },
    "世界文学·人文": { icon: "🧭", c1: "#334155", c2: "#475569" },
    "诗歌散文": { icon: "🪶", c1: "#5b21b6", c2: "#7c3aed" },
    "文学阅读": { icon: "📖", c1: "#9f1239", c2: "#be123c" },
    "悬疑推理": { icon: "🕵️", c1: "#3f3f46", c2: "#52525b" },
    "科幻奇幻": { icon: "🚀", c1: "#312e81", c2: "#4338ca" },
    "经济管理": { icon: "💼", c1: "#166534", c2: "#15803d" },
    "心理励志": { icon: "🌱", c1: "#a16207", c2: "#ca8a04" },
    "科技科普": { icon: "🔬", c1: "#075985", c2: "#0369a1" },
    "传记纪实": { icon: "🖋️", c1: "#7f1d1d", c2: "#991b1b" },
    "艺术生活": { icon: "🎨", c1: "#9d174d", c2: "#be185d" },
    "生活健康": { icon: "🍵", c1: "#3f6212", c2: "#4d7c0f" },
    "少儿教育": { icon: "🧸", c1: "#0369a1", c2: "#0284c7" },
    "综合百科": { icon: "🧭", c1: "#1e3a5f", c2: "#2f5d7c" },
    "精选论文": { icon: "📑", c1: "#3730a3", c2: "#4f46e5" },
    "在线教程文档": { icon: "🌐", c1: "#475569", c2: "#64748b" },
    "出版合集": { icon: "🗂️", c1: "#065f46", c2: "#059669" }
  };

  function categoryMeta(category) {
    return (
      CATEGORY_META[category] || { icon: "📚", c1: "#64748b", c2: "#94a3b8" }
    );
  }

  function chineseTitle(book) {
    // 只有简体中文把中文译名当作主标题。译名本身是纯数字或编号时不当成译名。
    // 没有译名时返回空，卡片改用英文书名。英文界面不走这里。
    if (currentLang !== "zh-CN") return "";
    var zh = trimText(book && book.zh);
    if (!isRealTitle(zh)) return "";
    return zh;
  }

  function sortTitle(book) {
    return chineseTitle(book) || originalTitle(book) || String((book && book.t) || "");
  }

  function coverText(book) {
    // 书脊只展示分类。没有分类时留空，不再截取书名前两个字。
    var category = book.c ? String(book.c).trim() : "";
    if (!category) return "";
    // 不换行连字符，避免 Self-Help / Sci-Fi 从连字符处拆到下一列。
    return categoryLabel(category).replace(/-/g, "\u2011");
  }

  // ==================================================================
  // 筛选 / 排序
  // ==================================================================
  var SORT_OK = {
    recommended: true,
    relevance: true,
    title: true,
    size: true
  };

  function normalizeSort(value) {
    return SORT_OK[value] ? value : "recommended";
  }

  function settleSort() {
    state.sort = "recommended";
  }

  // 推荐置顶：有下载链接的文学著作与科普交替排在最前，每部只留一本。
  // 文学含中国古典文学、中国现当代文学、外国文学、诗歌散文（以及尚未拆开的文学阅读）。
  // 科普为科技科普，或书名明确的科普名著（综合百科 / 人文社科）。
  var LITERATURE_CATS = {
    "文学阅读": true,
    "中国古典文学": true,
    "中国现当代文学": true,
    "外国文学": true,
    "诗歌散文": true
  };
  // 没有链接的不置顶。其余仍按可下载、中文书名、书名排序。
  var LITERATURE_PINS = [
    "红楼梦",
    "西游记",
    "水浒传",
    "三国演义",
    "楚辞",
    "论语",
    "孟子",
    "老子",
    "唐诗三百首",
    "宋词三百首",
    "古文观止",
    "野草",
    "朝花夕拾",
    "聊斋志异",
    "儒林外史",
    "西厢记",
    "牡丹亭",
    "围城"
  ];
  var SCIENCE_PINS = [
    "别逗了，费曼先生",
    "人类简史：从动物到上帝",
    "上帝掷骰子吗？量子物理史话",
    "给忙碌者的天体物理学",
    "寂静的春天（四师推荐精装版）",
    "基因传",
    "生命是什么：活细胞的物理观",
    "数学之美",
    "枪炮、病菌与钢铁 : 人类社会的命运 (世纪人文系列丛书·开放人文)",
    "天演论",
    "几何原本",
    "梦溪笔谈",
    "天工开物",
    "病毒星球",
    "细胞生命的礼赞",
    "未来简史",
    "浪潮之巅",
    "十问：霍金沉思录"
  ];

  var RECOMMENDED_PIN_RANK = {};
  var RECOMMENDED_PIN_KIND = {};
  var pinSlots = Math.max(LITERATURE_PINS.length, SCIENCE_PINS.length);
  var pinRank = 1;
  for (var pinSlot = 0; pinSlot < pinSlots; pinSlot += 1) {
    if (pinSlot < LITERATURE_PINS.length) {
      RECOMMENDED_PIN_RANK[LITERATURE_PINS[pinSlot]] = pinRank;
      RECOMMENDED_PIN_KIND[LITERATURE_PINS[pinSlot]] = "lit";
      pinRank += 1;
    }
    if (pinSlot < SCIENCE_PINS.length) {
      RECOMMENDED_PIN_RANK[SCIENCE_PINS[pinSlot]] = pinRank;
      RECOMMENDED_PIN_KIND[SCIENCE_PINS[pinSlot]] = "sci";
      pinRank += 1;
    }
  }

  function recommendedPinMatch(book) {
    if (!bookHasLinks(book)) return null;
    if (languageOf(book) !== "ZH") return null;
    var title = String(book.t || "").trim();
    var titleZh = String(book.zh || "").trim();
    var key = RECOMMENDED_PIN_RANK[title] ? title : "";
    if (!key && titleZh && RECOMMENDED_PIN_RANK[titleZh]) key = titleZh;
    if (!key) return null;
    var kind = RECOMMENDED_PIN_KIND[key];
    var cat = categoryOf(book);
    if (kind === "lit" && !LITERATURE_CATS[cat]) return null;
    if (
      kind === "sci" &&
      cat !== "科技科普" &&
      cat !== "综合百科" &&
      cat !== "人文社科"
    ) {
      return null;
    }
    return { key: key, rank: RECOMMENDED_PIN_RANK[key] };
  }

  function sortBooks(list) {
    state.sort = normalizeSort(state.sort);
    if (state.sort === "recommended") {
      // 推荐：文学与科普交替置顶（仅有链接的一本）；其余仍按可下载、中文书名、书名排序
      var cjk = /[\u4e00-\u9fff]/;
      var pinned = new Map();
      var usedPin = {};
      for (var pinI = 0; pinI < list.length; pinI += 1) {
        var pinMatch = recommendedPinMatch(list[pinI]);
        if (!pinMatch || usedPin[pinMatch.key]) continue;
        usedPin[pinMatch.key] = true;
        pinned.set(list[pinI], pinMatch.rank);
      }
      list.sort(function (a, b) {
        var pa = pinned.get(a) || 0;
        var pb = pinned.get(b) || 0;
        if (pa !== pb) {
          if (!pa) return 1;
          if (!pb) return -1;
          return pa - pb;
        }
        var ua = a.u ? 1 : 0;
        var ub = b.u ? 1 : 0;
        if (ua !== ub) return ub - ua;
        var ca = cjk.test(sortTitle(a)) ? 1 : 0;
        var cb = cjk.test(sortTitle(b)) ? 1 : 0;
        if (ca !== cb) return cb - ca;
        var x = sortTitle(a);
        var y = sortTitle(b);
        if (collator) return collator.compare(x, y);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return;
    }
    if (state.sort === "title") {
      list.sort(function (a, b) {
        var x = sortTitle(a);
        var y = sortTitle(b);
        if (collator) return collator.compare(x, y);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      return;
    }
    if (state.sort === "size") {
      list.sort(function (a, b) {
        return (Number(b.z) || 0) - (Number(a.z) || 0);
      });
      return;
    }
    // 相关度：标题命中权重最高，其次作者、分类、标签/文件名
    if (!state.tokens.length) return;
    var scores = new Map();
    for (var i = 0; i < list.length; i += 1) {
      var book = list[i];
      var score = 0;
      for (var j = 0; j < state.tokens.length; j += 1) {
        var token = state.tokens[j];
        if (searchTokenHits(book._title, token)) score += 8;
        else if (searchTokenHits(book._author, token)) score += 4;
        else if (searchTokenHits(book._category, token)) score += 2;
        else if (book._sub && searchTokenHits(book._sub, token)) score += 2;
        else score += 1;
      }
      scores.set(book, score);
    }
    list.sort(function (a, b) {
      return (scores.get(b) || 0) - (scores.get(a) || 0);
    });
  }

  function applyLocalFilters(list, keepHomeOrder) {
    var out = [];
    for (var i = 0; i < list.length; i += 1) {
      if (state.onlyDownloadable && !bookHasLinks(list[i])) continue;
      out.push(list[i]);
    }
    if (keepHomeOrder && state.sort === "recommended") return out;
    sortBooks(out);
    return out;
  }

  // ==================================================================
  // 格式化
  // ==================================================================
  function formatSize(bytes) {
    var num = Number(bytes) || 0;
    var units = ["B", "KB", "MB", "GB", "TB"];
    for (var i = 0; i < units.length; i += 1) {
      if (Math.abs(num) < 1024 || i === units.length - 1) {
        if (i === 0) return Math.round(num) + "B";
        return (Math.round(num * 10) / 10).toFixed(1) + units[i];
      }
      num /= 1024;
    }
    return "0B";
  }

  function formatSummary(counts, limit) {
    var entries = [];
    if (counts instanceof Map) {
      counts.forEach(function (count, key) {
        entries.push([key, count]);
      });
    } else {
      for (var key in counts) {
        if (Object.prototype.hasOwnProperty.call(counts, key)) entries.push([key, counts[key]]);
      }
    }
    entries.sort(function (a, b) {
      return b[1] - a[1] || (collator ? collator.compare(a[0], b[0]) : a[0] < b[0] ? -1 : 1);
    });
    if (!entries.length) return "—";
    var shown = entries.slice(0, limit).map(function (entry) {
      return String(entry[0]).toUpperCase();
    });
    if (entries.length > limit) {
      return shown.join(" · ") + " 等 " + entries.length + " 种";
    }
    return shown.join(" · ");
  }

  // ==================================================================
  // 渲染：统计概览
  // ==================================================================
  function updateStats() {
    if (dom.statCategories) dom.statCategories.textContent = String(chipCounts.categories.length);
  }

  function applyFolderLinks() {
    var CATEGORY_LINKS = window.CATEGORY_LINKS || {};
    var ROOT_LINK = window.ROOT_LINK || "";
    if (dom.rootLink) {
      if (ROOT_LINK) {
        dom.rootLink.href = ROOT_LINK;
        dom.rootLink.hidden = false;
      } else {
        dom.rootLink.hidden = true;
      }
    }

    // 侧栏「合集下载」：列出配置了分类文件夹链接的分类
    if (!dom.folderLinks || !dom.folderLinksGroup) return;
    var categories = Object.keys(CATEGORY_LINKS);
    if (!categories.length) {
      dom.folderLinksGroup.hidden = true;
      return;
    }
    var counts = {};
    for (var i = 0; i < chipCounts.categories.length; i += 1) {
      counts[chipCounts.categories[i].key] = chipCounts.categories[i].count;
    }
    categories.sort(function (a, b) {
      return (counts[b] || 0) - (counts[a] || 0);
    });
    dom.folderLinks.textContent = "";
    var shownFolders = 0;
    for (var j = 0; j < categories.length; j += 1) {
      var category = categories[j];
      var anchor = document.createElement("a");
      anchor.className = "folder-link";
      anchor.href = CATEGORY_LINKS[category];
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.title = t("folderLinkTitle").replace("{name}", categoryLabel(category));
      var label = document.createElement("span");
      label.className = "folder-link-name";
      label.textContent = categoryLabel(category);
      var badge = document.createElement("span");
      badge.className = "folder-link-badge";
      badge.textContent = t("folderBadge");
      anchor.appendChild(label);
      anchor.appendChild(badge);
      dom.folderLinks.appendChild(anchor);
      shownFolders += 1;
    }
    dom.folderLinksGroup.hidden = !shownFolders;
  }
  function highlightInto(el, text, tokens) {
    if (!tokens.length) {
      el.textContent = text;
      return;
    }
    var lower = foldSearchText(text);
    var ranges = [];
    for (var i = 0; i < tokens.length; i += 1) {
      var token = tokens[i];
      if (!token) continue;
      var from = 0;
      var idx;
      while ((idx = lower.indexOf(token, from)) !== -1) {
        ranges.push([idx, idx + token.length]);
        from = idx + token.length;
      }
    }
    if (!ranges.length) {
      el.textContent = text;
      return;
    }
    ranges.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    var merged = [];
    for (var j = 0; j < ranges.length; j += 1) {
      var range = ranges[j];
      var last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    var pos = 0;
    for (var k = 0; k < merged.length; k += 1) {
      var start = merged[k][0];
      var end = merged[k][1];
      if (start > pos) el.appendChild(document.createTextNode(text.slice(pos, start)));
      var mark = document.createElement("mark");
      mark.textContent = text.slice(start, end);
      el.appendChild(mark);
      pos = end;
    }
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  }

  function makeBadge(text, className) {
    var span = document.createElement("span");
    span.className = "badge " + className;
    span.textContent = text;
    return span;
  }

  function buildCard(book) {
    var hasLinks = bookHasLinks(book);
    var downloadable = !!downloadField(book.u);
    var folderLevel = !!book.fl;
    var names = cardHeading(book);
    var card = document.createElement("article");
    card.className = "card";
    var bookId = clickBookId(book);
    if (bookId) card.setAttribute("data-book-id", bookId);
    if (hasLinks) {
      card.className += " is-downloadable";
      card.dataset.url = downloadField(book.u) || downloadField(book.q);
    }
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute(
      "aria-label",
      (folderLevel ? t("ariaCollection") : t("ariaDownload")) +
        names.primary +
        (names.secondary ? " " + names.secondary : "")
    );

    // 卡片上半部分：封面占位 + 书名/标签/作者
    var top = document.createElement("div");
    top.className = "card-top";

    var meta = categoryMeta(categoryOf(book));
    card.style.setProperty("--cat-color", meta.c1);
    var cover = document.createElement("div");
    cover.className = "card-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.style.setProperty("--c1", meta.c1);
    cover.style.setProperty("--c2", meta.c2);
    var spineLabel = coverText(book);
    if (spineLabel) {
      var coverSpan = document.createElement("span");
      coverSpan.textContent = spineLabel;
      cover.appendChild(coverSpan);
    }

    var main = document.createElement("div");
    main.className = "card-main";

    var title = document.createElement("h3");
    title.className = "card-title";
    title.title = names.secondary ? names.primary + "\n" + names.secondary : names.primary;
    highlightInto(title, names.primary, state.tokens);
    main.appendChild(title);
    if (names.secondary) {
      var english = document.createElement("p");
      english.className = "card-title-en";
      english.title = names.secondary;
      highlightInto(english, names.secondary, state.tokens);
      main.appendChild(english);
    }

    var bookMeta = document.createElement("p");
    bookMeta.className = "card-meta";
    var authorText = authorLabel(book.a);
    if (authorText && !isUnknownAuthor(authorText)) {
      var author = document.createElement("span");
      author.className = "card-author";
      author.textContent = authorText;
      bookMeta.appendChild(author);
    }
    if (!isFilePage()) {
      var clicksEl = document.createElement("span");
      clicksEl.className = "card-clicks";
      clicksEl.textContent = clicksLabel(book.clicks);
      bookMeta.appendChild(clicksEl);
    }
    var size = document.createElement("span");
    size.className = "card-size";
    size.textContent = formatSize(book.z);
    bookMeta.appendChild(size);
    main.appendChild(bookMeta);

    var badges = document.createElement("div");
    badges.className = "badges";
    if (book.year) badges.appendChild(makeBadge(String(book.year), "badge-year"));
    if (book.e) badges.appendChild(makeBadge(String(book.e).toUpperCase(), "fmt fmt-" + formatOf(book)));
    badges.appendChild(makeBadge(languageLabel(languageOf(book)), "badge-lang"));
    badges.appendChild(makeBadge(categoryLabel(categoryOf(book)), "badge-cat"));
    if (book.s) badges.appendChild(makeBadge(subcategoryLabel(String(book.s)), "badge-sub"));
    if (downloadable && folderLevel) badges.appendChild(makeBadge(t("badgeCollection"), "badge-sub"));
    main.appendChild(badges);

    top.appendChild(cover);
    top.appendChild(main);
    card.appendChild(top);

    var actions = document.createElement("div");
    actions.className = "card-actions";
    var dl = document.createElement("button");
    dl.type = "button";
    dl.className = hasLinks ? "btn download" : "btn download is-empty";
    dl.textContent = t("download");
    dl.setAttribute(
      "aria-label",
      t("download") + " " + names.primary + (names.secondary ? " " + names.secondary : "")
    );
    actions.appendChild(dl);
    card.appendChild(actions);

    card._book = book;
    return card;
  }

  function queryValue() {
    return dom.q ? String(dom.q.value).trim() : "";
  }

  function queryEmpty() {
    return !queryValue();
  }

  // 首页 20 本：只有搜索框 trim 后为空才允许画。框里有字一律走搜索态。
  function homeBrowse() {
    return queryEmpty() && !state.categories.size;
  }

  function capSearchHits(list) {
    if (!Array.isArray(list)) return [];
    return list.length > SEARCH_LIMIT ? list.slice(0, SEARCH_LIMIT) : list;
  }

  function searchOverflow(list, extra) {
    if (extra && extra.truncated) return true;
    if (extra && typeof extra.total === "number" && extra.total > SEARCH_LIMIT) return true;
    return Array.isArray(list) && list.length > SEARCH_LIMIT;
  }

  function showLoadPending(asSearch) {
    state.searching = true;
    state.loadError = false;
    state.searchTruncated = false;
    state.results = [];
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    if (dom.empty) dom.empty.hidden = true;
    if (dom.loadMore) dom.loadMore.hidden = true;
    if (dom.loading) {
      var key = asSearch ? "searching" : "loading";
      dom.loading.setAttribute("data-i18n", key);
      dom.loading.textContent = t(key);
      dom.loading.hidden = false;
    }
    var toolbar = document.querySelector(".toolbar");
    if (toolbar) toolbar.classList.remove("is-home");
    hideSearchCount();
    syncHomeRankLabel();
  }

  function showSearchPending() {
    showLoadPending(true);
  }

  function setCountPiece(node, key) {
    if (!node) return;
    node.setAttribute("data-i18n", key);
    node.textContent = t(key);
  }

  // 「已筛选」只放进 count-filtered-lead。countMid 留下前半段，避免和原文案各写一次。
  // 英文 countMid 不含这几个字，前导留空，不会多出一份标签。
  function applyCountLabels() {
    setCountPiece(dom.countLead, "countLead");
    setCountPiece(dom.countTail, "countTail");
    var mid = t("countMid");
    var mark = "已筛选";
    var at = String(mid || "").indexOf(mark);
    if (dom.countMid) {
      dom.countMid.removeAttribute("data-i18n");
      dom.countMid.textContent = at === -1 ? mid : mid.slice(0, at);
    }
    if (dom.countFilteredLead) {
      dom.countFilteredLead.textContent = at === -1 ? "" : mid.slice(at);
    }
  }

  function applySearchableCount() {
    var el = document.getElementById("searchable-count");
    if (!el) return;
    var line = el.querySelector(".intro-count-text");
    if (line) {
      line.textContent = t("searchableLine");
      return;
    }
    el.textContent = t("searchableLine");
  }

  // 搜索进行中不沿用上一轮「已筛选 / 找到 N 本」。首页空 #q 也不展示这条搜索册数。
  function hideSearchCount() {
    if (dom.countSearch) dom.countSearch.hidden = true;
    if (dom.countFilteredLead) {
      dom.countFilteredLead.removeAttribute("data-i18n");
      dom.countFilteredLead.textContent = "";
    }
    if (dom.countFiltered) dom.countFiltered.textContent = "";
    if (dom.countTail) {
      dom.countTail.removeAttribute("data-i18n");
      dom.countTail.textContent = "";
    }
  }

  function updateCounts(total, filtered) {
    var home = homeBrowse();
    var toolbar = document.querySelector(".toolbar");
    if (toolbar) toolbar.classList.toggle("is-home", home && !state.loadError && !state.searching);
    applySearchableCount();
    applyCountLabels();
    if (state.loadError) {
      if (dom.countSearch) dom.countSearch.hidden = false;
      if (dom.countFilteredLead) {
        dom.countFilteredLead.removeAttribute("data-i18n");
        dom.countFilteredLead.textContent = t("loadErrorCount");
      }
      if (dom.countFiltered) dom.countFiltered.textContent = "";
      if (dom.countTail) {
        dom.countTail.removeAttribute("data-i18n");
        dom.countTail.textContent = "";
      }
      return;
    }
    if (home || state.searching) {
      hideSearchCount();
      return;
    }
    var truncated = !!state.searchTruncated;
    if (dom.countSearch) dom.countSearch.hidden = false;
    if (dom.countFilteredLead) {
      dom.countFilteredLead.removeAttribute("data-i18n");
      dom.countFilteredLead.textContent = truncated ? t("truncatedLead") : t("matchesLead");
    }
    if (dom.countFiltered) {
      dom.countFiltered.textContent = truncated ? String(SEARCH_LIMIT) : String(filtered);
    }
    if (dom.countTail) {
      dom.countTail.removeAttribute("data-i18n");
      dom.countTail.textContent = truncated ? t("truncatedTail") : t("matchesTail");
    }
  }

  function syncHomeRankLabel() {
    if (dom.homeRankLabel) {
      var show =
        !PAPERS_PAGE &&
        homeBrowse() &&
        !state.searching &&
        !state.loadError &&
        (state.results.length > 0 || !state.ready);
      dom.homeRankLabel.hidden = !show;
    }
    syncPickedVisibility();
    if (dom.picked && !dom.picked.hidden) paintPickedCards();
  }

  function paintChrome() {
    if (PAPERS_PAGE) {
      paintPapersChrome();
      return;
    }
    if (state.searching) {
      if (dom.empty) dom.empty.hidden = true;
      if (dom.loadMore) dom.loadMore.hidden = true;
      hideSearchCount();
      syncHomeRankLabel();
      return;
    }
    var filtered = state.results.length;
    var total = libraryTotal;
    updateCounts(total, filtered);

    var hasResults = filtered > 0;
    if (dom.empty) dom.empty.hidden = hasResults;
    if (!hasResults && dom.emptyTitle && dom.emptyHint) {
      var hasQuery = !queryEmpty();
      var showReset = false;
      if (state.loadError) {
        dom.emptyTitle.setAttribute("data-i18n", "loadErrorTitle");
        dom.emptyTitle.textContent = t("loadErrorTitle");
        var loadHint = t("loadErrorHint");
        dom.emptyHint.textContent = loadHint;
        dom.emptyHint.hidden = !loadHint;
      } else if (hasQuery) {
        dom.emptyTitle.textContent = t("emptyTitle");
        if (isFilePage()) {
          dom.emptyHint.textContent = t("fileSearchHint");
          dom.emptyHint.hidden = false;
        } else {
          dom.emptyHint.textContent = "";
          dom.emptyHint.hidden = true;
        }
        showReset = true;
      } else if (!total) {
        dom.emptyTitle.textContent = t("emptyLibraryTitle");
        dom.emptyHint.textContent = "";
        dom.emptyHint.hidden = true;
      } else {
        dom.emptyTitle.textContent = t("emptyTitle");
        dom.emptyHint.textContent = t("emptyHint");
        dom.emptyHint.hidden = false;
        showReset = true;
      }
      if (dom.emptyReset) dom.emptyReset.hidden = !showReset;
      if (dom.emptyRetry) dom.emptyRetry.hidden = !state.loadError;
    } else if (dom.emptyRetry) {
      dom.emptyRetry.hidden = true;
    }
    if (dom.loadMore) {
      var allowMore = hasResults && !homeBrowse() && state.visible < filtered;
      dom.loadMore.hidden = !allowMore;
      if (allowMore) {
        dom.loadMore.textContent = t("loadMoreLeft").replace("{n}", String(filtered - state.visible));
      }
    }
    syncHomeRankLabel();
  }

  function paintCount(count) {
    if (!dom.grid) return;
    var end = Math.min(count, state.results.length);
    if (end <= state.visible) return;
    var fragment = document.createDocumentFragment();
    for (var i = state.visible; i < end; i += 1) {
      fragment.appendChild(buildCard(state.results[i]));
    }
    dom.grid.appendChild(fragment);
    state.visible = end;
  }

  function paintPage() {
    // 搜索每次最多再画 PAGE_SIZE 本；命中更少就停，不把首页推荐或其他分类补进来。
    paintCount(Math.min(state.visible + PAGE_SIZE, state.results.length));
    paintChrome();
  }

  function finishResults(seq, list, extra) {
    if (seq !== querySeq) return;
    if (queryEmpty() && !state.categories.size) return;
    state.searching = false;
    state.loadError = false;
    if (dom.emptyReset) dom.emptyReset.hidden = false;
    if (dom.loading) dom.loading.hidden = true;
    state.searchTruncated = searchOverflow(list, extra);
    state.results = capSearchHits(list);
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintPage();
  }

  // 首页只画推荐切片（最多 HOME_LIMIT 本），不接整库加载更多。
  function finishHomeResults(seq, list) {
    if (seq !== querySeq) return;
    if (!homeBrowse()) return;
    state.searching = false;
    state.loadError = false;
    state.searchTruncated = false;
    if (dom.emptyReset) dom.emptyReset.hidden = false;
    if (dom.loading) dom.loading.hidden = true;
    state.results = list;
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    paintCount(list.length);
    paintChrome();
    fetchClicksForBooks(list);
  }

  function listsSharePrefix(list, count) {
    if (count > list.length || count > state.results.length) return false;
    for (var i = 0; i < count; i += 1) {
      if (state.results[i] !== list[i]) return false;
    }
    return true;
  }

  function presentResults(list, shown) {
    state.searchTruncated = searchOverflow(list) || state.searchTruncated;
    list = capSearchHits(list);
    var keep = shown > 0 && listsSharePrefix(list, shown);
    state.results = list;
    if (keep) {
      paintChrome();
      return;
    }
    state.visible = 0;
    if (dom.grid) dom.grid.textContent = "";
    var target = shown > 0 ? Math.min(shown, list.length) : Math.min(PAGE_SIZE, list.length);
    paintCount(target);
    paintChrome();
  }

  function collectMatches(tokens, categories) {
    if (!tokens.length && !categories.length) return [];
    var selected = null;
    if (categories.length) {
      selected = Object.create(null);
      for (var s = 0; s < categories.length; s += 1) selected[categories[s]] = true;
    }
    var hits = [];
    for (var i = 0; i < catalogBooks.length; i += 1) {
      var book = catalogBooks[i];
      if (selected && !selected[categoryOf(book)]) continue;
      if (tokens.length && !entryMatches(book, tokens)) continue;
      hits.push(book);
    }
    return hits;
  }

  function refreshSearchResults() {
    if (homeBrowse() || state.loadError || state.searching || queryEmpty()) return;
    var seq = querySeq;
    var categories = selectedCategoryNames();
    var list = applyLocalFilters(collectMatches(state.tokens, categories), false);
    if (seq !== querySeq || state.loadError) return;
    if (dom.loading) dom.loading.hidden = true;
    presentResults(list, state.visible);
  }

  function onCatalogGrew() {
    if (!state.ready || state.loadError) return;
    if (homeBrowse()) return;
    refreshSearchResults();
  }

  function selectedCategoryNames() {
    var categories = [];
    state.categories.forEach(function (name) {
      categories.push(name);
    });
    return categories;
  }

  function abortSearchRequest() {
    if (!searchAbort) return;
    try {
      searchAbort.abort();
    } catch (err) {}
    searchAbort = null;
  }

  function isAbortError(error) {
    if (!error) return false;
    if (error.name === "AbortError") return true;
    if (typeof DOMException !== "undefined" && error instanceof DOMException) {
      return error.code === DOMException.ABORT_ERR;
    }
    return false;
  }

  function requestResults() {
    var seq = ++querySeq;
    state.tokens = tokenizeQuery(queryValue());
    var tokens = state.tokens;
    var categories = selectedCategoryNames();
    applyCountLabels();
    if (queryEmpty() && !categories.length) {
      abortSearchRequest();
      if (state.loadError && !homeBooks.length) {
        paintPage();
        return;
      }
      var homeList = applyLocalFilters(homeBooks.slice(), state.sort === "recommended");
      finishHomeResults(seq, homeList);
      return;
    }

    showSearchPending();

    if (isFilePage()) {
      finishResults(seq, applyLocalFilters(collectMatches(tokens, categories), false));
      return;
    }

    if (typeof window.fetch !== "function") {
      showLoadError(new Error("fetch unavailable"));
      return;
    }

    var query = queryValue();
    if (!query && !categories.length) {
      abortSearchRequest();
      finishResults(seq, []);
      return;
    }

    abortSearchRequest();

    // Skip only the last completed successful q, never an aborted in-flight one.
    if (query && query === lastRequestedQ) {
      finishResults(seq, applyLocalFilters(lastRequestedHits.slice(), false), lastRequestedExtra);
      return;
    }

    var searchUrl = "/api/search?";
    var parts = [];
    if (query) parts.push("q=" + encodeURIComponent(query));
    if (categories.length === 1) parts.push("category=" + encodeURIComponent(categories[0]));
    searchUrl += parts.join("&");

    var fetchOpts = {};
    if (typeof AbortController === "function") {
      searchAbort = new AbortController();
      fetchOpts.signal = searchAbort.signal;
    }

    window
      .fetch(searchUrl, fetchOpts)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (doc) {
        if (seq !== querySeq || queryEmpty()) return;
        var rows = [];
        if (doc && Array.isArray(doc.books)) rows = doc.books;
        else if (Array.isArray(doc)) rows = doc;
        var books = adoptList(rows);
        for (var i = 0; i < books.length; i += 1) rememberCatalogBook(books[i]);
        // Same trimmed q skip is only valid after this request actually completed.
        if (seq !== querySeq) return;
        lastRequestedQ = query;
        lastRequestedHits = books.slice();
        lastRequestedExtra = {
          truncated: !!(doc && doc.truncated),
          total: doc && typeof doc.total === "number" ? doc.total : undefined
        };
        finishResults(seq, applyLocalFilters(books, false), lastRequestedExtra);
      })
      .catch(function (error) {
        if (isAbortError(error)) return;
        if (seq !== querySeq || queryEmpty()) return;
        showLoadError(error);
      });
  }

  function render(reset) {
    if (PAPERS_PAGE) {
      renderPapers(reset);
      return;
    }
    if (!state.ready) return;
    if (!reset) {
      if (state.searching || (!homeBrowse() && !state.results.length)) return;
      paintPage();
      return;
    }
    requestResults();
  }

  function syncTokensFromQuery() {
    state.tokens = tokenizeQuery(queryValue());
  }

  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      syncTokensFromQuery();
      render(true);
    }, DEBOUNCE_MS);
  }

  // Typing/deleting: abort any in-flight /api/search and restart the 350ms timer.
  // Do not send a replacement request until the box is quiet again.
  function onQueryEdited() {
    abortSearchRequest();
    querySeq += 1;
    if (PAPERS_PAGE) {
      if (!queryEmpty()) showSearchPending();
      else if (dom.loading) dom.loading.hidden = true;
      scheduleRender();
      return;
    }
    if (queryEmpty()) {
      state.categories.clear();
      updateFilterChrome();
      hideSearchCount();
    } else {
      showSearchPending();
      updateFilterChrome();
    }
    scheduleRender();
  }

  function renderNow() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    syncTokensFromQuery();
    render(true);
  }

  // ==================================================================
  // 筛选 chips
  // ==================================================================
  function buildChipCounts() {
    chipCounts.categories.sort(function (a, b) {
      return b.count - a.count || (collator ? collator.compare(a.key, b.key) : a.key < b.key ? -1 : 1);
    });
  }

  function appendChip(container, entry, selected, labelFn, extra) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.value = extra && extra.value != null ? extra.value : entry.key;
    if (extra && extra.branch) {
      button.classList.add("chip-branch");
      button.dataset.branch = "1";
      button.setAttribute("aria-haspopup", "true");
    }
    if (extra && extra.search != null) button.dataset.search = extra.search;
    if (extra && extra.empty) button.dataset.empty = "1";
    if (selected && selected.has(entry.key)) {
      button.setAttribute("aria-pressed", "true");
      button.classList.add("active");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    var label = document.createElement("span");
    label.className = "chip-label";
    var text = document.createElement("span");
    text.className = "chip-text";
    text.textContent = labelFn(entry.key);
    label.appendChild(text);
    button.appendChild(label);

    var count = document.createElement("span");
    count.className = "chip-count";
    count.textContent = extra && extra.countText != null ? extra.countText : String(entry.count);
    button.appendChild(count);
    container.appendChild(button);
    return button;
  }

  function renderChips(container, entries, selected, labelFn) {
    if (!container) return;
    container.textContent = "";
    for (var i = 0; i < entries.length; i += 1) {
      appendChip(container, entries[i], selected, labelFn);
    }
  }

  function updateFilterChrome() {
    var active =
      state.categories.size +
      (state.onlyDownloadable ? 1 : 0);
    var hasQuery = !!(dom.q && dom.q.value && dom.q.value.trim());
    var badges = document.querySelectorAll(".filter-count");
    for (var b = 0; b < badges.length; b += 1) {
      badges[b].textContent = String(active);
      badges[b].hidden = active === 0;
    }
    // 搜索词也算“可清空”的状态，否则只输入了关键词时按钮是禁用、点了没反应
    if (dom.clearFilters) dom.clearFilters.disabled = active === 0 && !hasQuery;
    syncHomeCategoryPressed();
  }

  function categoryHasChildren(entry) {
    return !!(entry && entry.children && entry.children.length);
  }

  // 搜索框里的分类名跟界面语言走；子类键保持库内原值。英文界面另把已有英文标签的中文子类名换掉。
  function localizedSearchText(key) {
    var name = key == null ? "" : String(key);
    if (!name) return "";
    if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, name)) return categoryLabel(name);
    if (currentLang !== "zh-CN" && Object.prototype.hasOwnProperty.call(SUBCATEGORY_EN, name)) {
      return SUBCATEGORY_EN[name];
    }
    return name;
  }

  function childSearchQuery(parent, child) {
    if (child && child.search) return localizedSearchText(child.search);
    var parentKey = parent && (parent.search || parent.key) ? (parent.search || parent.key) : "";
    var parentText = localizedSearchText(parentKey);
    if (child && child.empty) return parentText;
    var childText = localizedSearchText(child && child.key);
    if (!parentText) return childText;
    if (!childText) return parentText;
    return parentText + " " + childText;
  }

  function findCategoryChild(parent, key) {
    var kids = parent && parent.children ? parent.children : chipCounts.categories;
    for (var i = 0; i < kids.length; i += 1) {
      if (kids[i].key === key) return kids[i];
    }
    return null;
  }

  function categoryQueryKey(entry) {
    return entry && (entry.search || entry.key) ? String(entry.search || entry.key) : "";
  }

  function foldedCategoryAliases(key) {
    var name = key == null ? "" : String(key);
    var english = Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, name)
      ? (CATEGORY_LABELS[name] || name)
      : name;
    return [foldSearchText(name).trim(), foldSearchText(english).trim()];
  }

  function currentHomeQuery() {
    return foldSearchText(dom.q && dom.q.value ? dom.q.value : "").trim();
  }

  function queryMatchesHomeSearch(search) {
    var current = currentHomeQuery();
    if (!current) return false;
    return current === foldSearchText(search || "").trim();
  }

  function retargetHomeCategoryQuery() {
    if (PAPERS_PAGE || !dom.q) return false;
    var current = currentHomeQuery();
    if (!current) return false;
    var keys = [];
    var list = chipCounts.categories || [];
    for (var i = 0; i < list.length; i += 1) {
      var key = categoryQueryKey(list[i]);
      if (key) keys.push(key);
    }
    for (var k = 0; k < keys.length; k += 1) {
      var aliases = foldedCategoryAliases(keys[k]);
      if (aliases[0] !== current && aliases[1] !== current) continue;
      var next = localizedSearchText(keys[k]);
      if (dom.q.value === next) return false;
      dom.q.value = next;
      return true;
    }
    var parent = papersCategoryNode();
    var kids = parent && parent.children ? parent.children : [];
    for (var c = 0; c < kids.length; c += 1) {
      var childKey = kids[c] && kids[c].key;
      if (!childKey || isIdleCategory(childKey)) continue;
      var chinese = Object.prototype.hasOwnProperty.call(SUBCATEGORY_LABELS, childKey)
        ? SUBCATEGORY_LABELS[childKey]
        : childKey;
      if (foldSearchText(childKey).trim() !== current && foldSearchText(chinese).trim() !== current) continue;
      var nextChild = papersChildSearchText(childKey);
      if (dom.q.value === nextChild) return false;
      dom.q.value = nextChild;
      return true;
    }
    return false;
  }

  function papersChildSearchText(key) {
    var name = key == null ? "" : String(key);
    if (!name) return "";
    if (currentLang === "zh-CN") return subcategoryLabel(name);
    return name;
  }

  function homeCategorySpecs() {
    var specs = [];
    var list = chipCounts.categories || [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      if (!entry || !entry.key) continue;
      var key = categoryQueryKey(entry);
      specs.push({
        value: entry.key,
        search: entry.key === PAPERS_CATEGORY ? "" : localizedSearchText(key),
        label: categoryLabel(entry.key),
        countText: formatCount(entry.count),
        drill: entry.key === PAPERS_CATEGORY
      });
    }
    if (!specs.length) return specs;
    return specs;
  }

  function paintHomeCategories() {
    var panel = document.getElementById("home-categories-panel");
    var box = document.getElementById("home-categories");
    if (!box || PAPERS_PAGE) {
      if (panel) panel.hidden = true;
      return;
    }
    var specs = homeCategorySpecs();
    if (!specs.length) {
      box.textContent = "";
      if (panel) panel.hidden = true;
      return;
    }
    if (panel) panel.hidden = false;
    box.textContent = "";
    for (var i = 0; i < specs.length; i += 1) {
      var spec = specs[i];
      if (spec.inert || isIdleCategory(spec.value)) {
        box.appendChild(staticCategoryChip(spec.label, spec.countText, spec.value));
        continue;
      }
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.value = spec.value;
      if (spec.drill) {
        button.dataset.drill = "1";
        button.setAttribute("aria-haspopup", "dialog");
        fillChip(button, spec.label, 0, false);
      } else {
        button.dataset.search = spec.search;
        fillChip(button, spec.label, 0, queryMatchesHomeSearch(spec.search));
      }
      var num = button.querySelector(".chip-count");
      if (num) num.textContent = spec.countText;
      box.appendChild(button);
    }
  }

  function syncHomeCategoryPressed() {
    var box = document.getElementById("home-categories");
    if (!box) return;
    var buttons = box.querySelectorAll("button.chip");
    for (var i = 0; i < buttons.length; i += 1) {
      var pressed = queryMatchesHomeSearch(buttons[i].dataset.search || "");
      buttons[i].classList.toggle("active", pressed);
      buttons[i].setAttribute("aria-pressed", pressed ? "true" : "false");
    }
  }

  function paintPapersSubcategoryModal() {
    if (!catModal) return;
    catModal.title.textContent = categoryLabel(PAPERS_CATEGORY);
    if (catModal.back) catModal.back.hidden = true;
    var box = catModal.chips;
    box.textContent = "";
    var parent = papersCategoryNode();
    var kids = parent && parent.children ? parent.children : [];
    for (var i = 0; i < kids.length; i += 1) {
      var child = kids[i];
      if (!child || !child.key) continue;
      var countText = formatCount(child.count);
      var label = subcategoryLabel(child.key);
      if (isIdleCategory(child.key)) {
        box.appendChild(staticCategoryChip(label, countText, child.key));
        continue;
      }
      var search = papersChildSearchText(child.key);
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.value = child.key;
      button.dataset.search = search;
      fillChip(button, label, 0, queryMatchesHomeSearch(search));
      var num = button.querySelector(".chip-count");
      if (num) num.textContent = countText;
      box.appendChild(button);
    }
  }

  function refreshChips() {
    paintHomeCategories();
    if (catModal) paintPapersSubcategoryModal();
    updateFilterChrome();
  }

  function bindChips(container, selected) {
    if (!container) return;
    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest("button.chip");
      if (!button || !container.contains(button)) return;
      var key = button.dataset.value;
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      var active = selected.has(key);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      updateFilterChrome();
      render(true);
    });
  }

  // ==================================================================
  // 分类弹窗：数据来自 data/categories.json，不拉书籍分片
  // ==================================================================
  var catModal = null;
  var catModalLastFocus = null;
  var catModalStack = [];

  function closeCategoryModal() {
    if (!catModal || catModal.overlay.hidden) return;
    catModal.overlay.hidden = true;
    document.documentElement.classList.remove("dl-open");
    if (catModalLastFocus && catModalLastFocus.focus) {
      try { catModalLastFocus.focus(); } catch (err) {}
    }
  }

  function ensureCategoryModal() {
    if (catModal) return catModal;
    var overlay = document.createElement("div");
    overlay.className = "dl-overlay";
    overlay.hidden = true;
    var panel = document.createElement("div");
    panel.className = "dl-modal cat-modal";
    panel.id = "category-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "category-modal-title");
    panel.tabIndex = -1;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "dl-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("modalClose"));
    panel.appendChild(close);

    var title = document.createElement("h2");
    title.className = "dl-title";
    title.id = "category-modal-title";
    title.textContent = t("categoryTitle");
    panel.appendChild(title);

    var back = document.createElement("button");
    back.type = "button";
    back.className = "chip cat-modal-back";
    back.textContent = t("categoryBack");
    back.hidden = true;
    panel.appendChild(back);

    var chips = document.createElement("div");
    chips.className = "chips";
    chips.id = "filter-categories";
    panel.appendChild(chips);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    close.addEventListener("click", closeCategoryModal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeCategoryModal();
    });
    document.addEventListener("keydown", function (event) {
      if (!overlay.hidden && event.key === "Escape") closeCategoryModal();
    });
    back.addEventListener("click", function () {
      catModalStack.pop();
      refreshChips();
    });
    chips.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest("button.chip");
      if (!button || !chips.contains(button) || button.classList.contains("chip-static")) return;
      var key = button.dataset.value;
      if (!key || isIdleCategory(key)) return;
      var query = button.dataset.search || "";
      if (!dom.q || !query) return;
      dom.q.value = queryMatchesHomeSearch(query) ? "" : query;
      state.categories.clear();
      closeCategoryModal();
      updateFilterChrome();
      renderNow();
    });

    dom.categoryChips = chips;
    catModal = {
      overlay: overlay,
      panel: panel,
      title: title,
      chips: chips,
      back: back,
      close: close
    };
    return catModal;
  }

  function openCategoryModal() {
    var modal = ensureCategoryModal();
    catModalLastFocus = document.activeElement;
    catModalStack = [];
    modal.close.setAttribute("aria-label", t("modalClose"));
    if (modal.back) modal.back.hidden = true;
    refreshChips();
    modal.overlay.hidden = false;
    document.documentElement.classList.add("dl-open");
    if (modal.panel && modal.panel.focus) modal.panel.focus();
    fetchCategoriesCatalog();
  }

  function bindHomeCategories() {
    var box = document.getElementById("home-categories");
    if (!box || box.dataset.bound === "1") return;
    box.dataset.bound = "1";
    box.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest("button.chip");
      if (!button || !box.contains(button) || button.classList.contains("chip-static")) return;
      if (isIdleCategory(button.dataset.value)) return;
      if (homeCatCollapsed) closeHomeCategoryModal();
      if (button.dataset.drill === "1") {
        // 论文分类：直接跳转到论文页，不在首页筛选
        window.location.href = "selected-papers.html";
        return;
      }
      var search = button.dataset.search || "";
      if (!dom.q || !search) return;
      dom.q.value = queryMatchesHomeSearch(search) ? "" : search;
      state.categories.clear();
      updateFilterChrome();
      renderNow();
    });
  }

  // ==================================================================
  // 窄屏（书籍卡片单列）：分类 chips 收起，点首页文案弹出分类弹窗
  // 宽屏仍保持原来的展开样式，DOM 与样式都不动。
  // ==================================================================
  var homeCatModal = null;
  var homeCatLastFocus = null;
  var homeCatCollapsed = false;

  // 首页与论文页共用：书籍/论文卡片是否排成单列。
  function gridIsSingleColumn() {
    var grid = document.getElementById("grid");
    if (!grid) return false;
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) return true;
    var columns = "";
    try {
      columns = window.getComputedStyle(grid).gridTemplateColumns || "";
    } catch (err) {
      return false;
    }
    columns = columns.trim();
    if (!columns || columns === "none") return false;
    return columns.split(/\s+/).length <= 1;
  }

  function homeCategoriesSingleColumn() {
    if (PAPERS_PAGE) return false;
    return gridIsSingleColumn();
  }

  function ensureHomeCategoryModal() {
    if (homeCatModal) return homeCatModal;
    var overlay = document.createElement("div");
    overlay.className = "dl-overlay";
    overlay.id = "home-category-overlay";
    overlay.hidden = true;

    var panel = document.createElement("div");
    panel.className = "dl-modal cat-modal home-cat-modal";
    panel.id = "home-category-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "home-category-modal-title");
    panel.tabIndex = -1;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "dl-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("modalClose"));
    close.setAttribute("data-i18n-aria", "modalClose");
    panel.appendChild(close);

    var title = document.createElement("h2");
    title.className = "dl-title";
    title.id = "home-category-modal-title";
    title.setAttribute("data-i18n", "homeLead");
    title.textContent = t("homeLead");
    panel.appendChild(title);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    close.addEventListener("click", function () {
      closeHomeCategoryModal();
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeHomeCategoryModal();
    });
    document.addEventListener("keydown", function (event) {
      if (overlay.hidden || event.key !== "Escape") return;
      event.preventDefault();
      // 这个监听器比全局 Esc（清空搜索）更早注册，截住事件避免关弹窗时把搜索也清掉。
      event.stopImmediatePropagation();
      closeHomeCategoryModal();
    });

    homeCatModal = {
      overlay: overlay,
      panel: panel,
      title: title,
      close: close
    };
    return homeCatModal;
  }

  function closeHomeCategoryModal(restoreFocus) {
    if (!homeCatModal || homeCatModal.overlay.hidden) return;
    homeCatModal.overlay.hidden = true;
    document.documentElement.classList.remove("dl-open");
    var lead = document.getElementById("home-lead");
    if (lead) lead.setAttribute("aria-expanded", "false");
    if (restoreFocus !== false && homeCatLastFocus && homeCatLastFocus.focus) {
      try {
        homeCatLastFocus.focus();
      } catch (err) {}
    }
  }

  function openHomeCategoryModal() {
    if (!homeCatCollapsed) return;
    var box = document.getElementById("home-categories");
    var lead = document.getElementById("home-lead");
    if (!box || !lead) return;
    var modal = ensureHomeCategoryModal();
    homeCatLastFocus =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : lead;
    modal.panel.appendChild(box);
    modal.title.textContent = t("homeLead");
    modal.close.setAttribute("aria-label", t("modalClose"));
    modal.overlay.hidden = false;
    document.documentElement.classList.add("dl-open");
    lead.setAttribute("aria-expanded", "true");
    syncHomeCategoryPressed();
    if (modal.panel.focus) modal.panel.focus();
  }

  // 只在书籍网格变成单列时收起分类；恢复宽屏时把 chips 放回原位。
  function syncHomeCategoriesLayout() {
    if (PAPERS_PAGE) return;
    var panel = document.getElementById("home-categories-panel");
    var lead = document.getElementById("home-lead");
    var row = panel ? panel.querySelector(".papers-filter-row") : null;
    var box = document.getElementById("home-categories");
    if (!panel || !lead || !row || !box) return;
    var collapsed = homeCategoriesSingleColumn();
    if (!collapsed) {
      if (!homeCatCollapsed) return;
      closeHomeCategoryModal(false);
      row.appendChild(box);
      lead.removeAttribute("role");
      lead.removeAttribute("tabindex");
      lead.removeAttribute("aria-haspopup");
      lead.removeAttribute("aria-expanded");
      document.documentElement.classList.remove("cat-collapsed");
      homeCatCollapsed = false;
      return;
    }
    if (homeCatCollapsed) return;
    var modal = ensureHomeCategoryModal();
    modal.panel.appendChild(box);
    lead.setAttribute("role", "button");
    lead.setAttribute("tabindex", "0");
    lead.setAttribute("aria-haspopup", "dialog");
    lead.setAttribute("aria-expanded", "false");
    document.documentElement.classList.add("cat-collapsed");
    homeCatCollapsed = true;
  }

  function bindHomeCategoryToggle() {
    var lead = document.getElementById("home-lead");
    if (!lead || lead.dataset.catBound === "1") return;
    lead.dataset.catBound = "1";
    lead.addEventListener("click", function () {
      if (!homeCatCollapsed) return;
      openHomeCategoryModal();
    });
    lead.addEventListener("keydown", function (event) {
      if (!homeCatCollapsed) return;
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      openHomeCategoryModal();
    });
    syncHomeCategoriesLayout();
    window.addEventListener("resize", syncHomeCategoriesLayout);
    if (window.matchMedia) {
      var query = window.matchMedia("(max-width: 720px)");
      if (query.addEventListener) query.addEventListener("change", syncHomeCategoriesLayout);
      else if (query.addListener) query.addListener(syncHomeCategoriesLayout);
    }
  }

  // ==================================================================
  // 论文页：卡片单列时，学科 chips 收进「筛选」弹窗，按钮在年份按钮左边。
  // 宽屏保持原来展开的学科 chips，DOM 与样式都不动。
  // ==================================================================
  var papersFilterModal = null;
  var papersFilterLastFocus = null;
  var papersCatCollapsed = false;

  function ensurePapersFilterModal() {
    if (papersFilterModal) return papersFilterModal;
    var overlay = document.createElement("div");
    overlay.className = "dl-overlay";
    overlay.id = "papers-filter-overlay";
    overlay.hidden = true;

    var panel = document.createElement("div");
    panel.className = "dl-modal cat-modal papers-filter-modal";
    panel.id = "papers-filter-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "papers-filter-modal-title");
    panel.tabIndex = -1;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "dl-close";
    close.textContent = "×";
    close.setAttribute("aria-label", t("modalClose"));
    close.setAttribute("data-i18n-aria", "modalClose");
    panel.appendChild(close);

    var title = document.createElement("h2");
    title.className = "dl-title";
    title.id = "papers-filter-modal-title";
    title.setAttribute("data-i18n", "filtersTitle");
    title.textContent = t("filtersTitle");
    panel.appendChild(title);

    var done = document.createElement("button");
    done.type = "button";
    done.className = "btn primary papers-filter-done";
    done.setAttribute("data-i18n", "filtersDone");
    done.textContent = t("filtersDone");

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    close.addEventListener("click", function () {
      closePapersFilterModal();
    });
    done.addEventListener("click", function () {
      closePapersFilterModal();
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closePapersFilterModal();
    });
    document.addEventListener("keydown", function (event) {
      if (overlay.hidden || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePapersFilterModal();
    });

    papersFilterModal = {
      overlay: overlay,
      panel: panel,
      title: title,
      close: close,
      done: done
    };
    return papersFilterModal;
  }

  function closePapersFilterModal(restoreFocus) {
    if (!papersFilterModal || papersFilterModal.overlay.hidden) return;
    papersFilterModal.overlay.hidden = true;
    document.documentElement.classList.remove("dl-open");
    var opener = document.getElementById("papers-filter-open");
    if (opener) opener.setAttribute("aria-expanded", "false");
    if (restoreFocus !== false && papersFilterLastFocus && papersFilterLastFocus.focus) {
      try {
        papersFilterLastFocus.focus();
      } catch (err) {}
    }
  }

  function openPapersFilterModal() {
    if (!papersCatCollapsed) return;
    var modal = ensurePapersFilterModal();
    var opener = document.getElementById("papers-filter-open");
    if (!opener) return;
    papersFilterLastFocus =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : opener;
    modal.title.textContent = t("filtersTitle");
    modal.close.setAttribute("aria-label", t("modalClose"));
    modal.overlay.hidden = false;
    document.documentElement.classList.add("dl-open");
    opener.setAttribute("aria-expanded", "true");
    if (modal.panel.focus) modal.panel.focus();
  }

  // 已选学科数同步到「筛选」按钮上的小角标。
  function syncPapersFilterButton() {
    var opener = document.getElementById("papers-filter-open");
    if (!opener) return;
    var count = document.getElementById("papers-filter-count");
    var total = papersSubjects.size;
    if (count) {
      count.textContent = total ? String(total) : "";
      count.hidden = !total;
    }
    opener.classList.toggle("is-active", total > 0);
  }

  // 单列时把学科 chips 和「清空筛选」搬进弹窗，宽屏时搬回原位。
  function syncPapersFilterLayout() {
    if (!PAPERS_PAGE) return;
    var root = document.getElementById("papers-filters");
    var opener = document.getElementById("papers-filter-open");
    var subjects = document.getElementById("papers-subjects");
    var clear = document.getElementById("papers-clear");
    if (!root || !opener || !subjects || !clear) return;
    var collapsed = gridIsSingleColumn();
    if (!collapsed) {
      if (!papersCatCollapsed) return;
      closePapersFilterModal(false);
      root.appendChild(subjects);
      root.appendChild(clear);
      opener.hidden = true;
      opener.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("papers-cat-collapsed");
      papersCatCollapsed = false;
      return;
    }
    if (papersCatCollapsed) return;
    var modal = ensurePapersFilterModal();
    modal.panel.appendChild(subjects);
    modal.panel.appendChild(clear);
    modal.panel.appendChild(modal.done);
    opener.hidden = false;
    opener.setAttribute("aria-expanded", "false");
    document.documentElement.classList.add("papers-cat-collapsed");
    papersCatCollapsed = true;
    syncPapersFilterButton();
  }

  function bindPapersFilterToggle() {
    if (!PAPERS_PAGE) return;
    var opener = document.getElementById("papers-filter-open");
    if (!opener || opener.dataset.catBound === "1") return;
    opener.dataset.catBound = "1";
    opener.addEventListener("click", function () {
      if (!papersCatCollapsed) return;
      if (papersFilterModal && !papersFilterModal.overlay.hidden) closePapersFilterModal();
      else openPapersFilterModal();
    });
    syncPapersFilterLayout();
    window.addEventListener("resize", syncPapersFilterLayout);
    if (window.matchMedia) {
      var query = window.matchMedia("(max-width: 720px)");
      if (query.addEventListener) query.addEventListener("change", syncPapersFilterLayout);
      else if (query.addListener) query.addListener(syncPapersFilterLayout);
    }
  }

  // ==================================================================
  // 下载链接弹窗（城通 + 夸克）
  // ==================================================================
  var dlModal = null;
  var dlModalLastFocus = null;

  function quarkHref(url, passcode) {
    var href = String(url || "");
    if (passcode && href.indexOf("pwd=") === -1) {
      href += (href.indexOf("?") === -1 ? "?" : "&") + "pwd=" + encodeURIComponent(passcode);
    }
    return href;
  }

  function appendDownloadRow(container, source, url, passcode) {
    var row = document.createElement("div");
    row.className = "dl-link";
    var info = document.createElement("div");
    info.className = "dl-link-info";
    var name = document.createElement("span");
    name.className = "dl-link-name";
    name.textContent = source;
    info.appendChild(name);
    if (passcode) {
      var code = document.createElement("span");
      code.className = "dl-link-code";
      code.textContent = t("modalCode").replace("{code}", passcode);
      info.appendChild(code);
    }
    var actions = document.createElement("div");
    actions.className = "dl-link-actions";
    var open = document.createElement("a");
    open.className = "btn primary";
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = t("modalOpen");
    actions.appendChild(open);
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn copy";
    copy.textContent = t("modalCopy");
    copy.dataset.url = url;
    copy.dataset.password = passcode || "";
    actions.appendChild(copy);
    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  }

  function ensureDownloadModal() {
    if (dlModal) return dlModal;
    var overlay = document.createElement("div");
    overlay.className = "dl-overlay";
    overlay.hidden = true;
    var panel = document.createElement("div");
    panel.className = "dl-modal";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.tabIndex = -1;

    var close = document.createElement("button");
    close.type = "button";
    close.className = "dl-close";
    close.textContent = "×";
    close.setAttribute("data-i18n-aria", "modalClose");
    close.setAttribute("aria-label", t("modalClose"));
    panel.appendChild(close);

    var title = document.createElement("h2");
    title.className = "dl-title";
    panel.appendChild(title);
    var subtitle = document.createElement("p");
    subtitle.className = "dl-subtitle";
    subtitle.hidden = true;
    panel.appendChild(subtitle);
    var meta = document.createElement("p");
    meta.className = "dl-meta";
    panel.appendChild(meta);
    var hint = document.createElement("p");
    hint.className = "dl-hint";
    hint.setAttribute("data-i18n", "modalSubtitle");
    hint.textContent = t("modalSubtitle");
    panel.appendChild(hint);
    var links = document.createElement("div");
    links.className = "dl-links";
    panel.appendChild(links);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function closeModal() {
      overlay.hidden = true;
      document.documentElement.classList.remove("dl-open");
      if (dlModalLastFocus && dlModalLastFocus.focus) {
        try { dlModalLastFocus.focus(); } catch (err) {}
      }
    }
    close.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener("keydown", function (event) {
      if (!overlay.hidden && event.key === "Escape") closeModal();
    });
    links.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var open = target.closest("a.btn.primary");
      if (open) {
        postBookClick(dlModal.book);
        return;
      }
      var copy = target.closest("button[data-url]");
      if (copy) {
        event.preventDefault();
        postBookClick(dlModal.book);
        copyLink(copy.dataset.url, copy.dataset.password || "", copy);
      }
    });
    dlModal = {
      overlay: overlay,
      panel: panel,
      title: title,
      subtitle: subtitle,
      meta: meta,
      links: links,
      close: close,
      closeModal: closeModal
    };
    return dlModal;
  }

  function clickBookId(book) {
    if (!book) return "";
    var filename = book.f || book.filename || "";
    var candidate = "";
    if (book.id != null && String(book.id).trim() !== "") {
      candidate = String(book.id).trim();
    } else if (String(filename).trim()) {
      candidate = String(filename).trim();
    } else {
      candidate = [book.t || book.title || "", book.a || book.author || "", filename].join("-").trim();
    }
    if (!candidate) return "";
    if (/^[A-Za-z0-9_-]{1,200}$/.test(candidate)) return candidate;
    var slug = candidate.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug) return slug.slice(0, 200);
    var hash = 2166136261;
    for (var i = 0; i < candidate.length; i += 1) {
      hash ^= candidate.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "b" + (hash >>> 0).toString(36);
  }

  function mergeBookRecord(book, extra) {
    if (!extra) return book;
    var next = normalizeBook(extra) || extra;
    var merged = {};
    var key;
    for (key in book) {
      if (Object.prototype.hasOwnProperty.call(book, key)) merged[key] = book[key];
    }
    for (key in next) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
      if (next[key] === "" || next[key] == null) continue;
      merged[key] = next[key];
    }
    indexBook(merged);
    rememberBook(merged);
    rememberCatalogBook(merged);
    return merged;
  }

  function fetchBookRecord(id) {
    return window.fetch("/api/book?id=" + encodeURIComponent(id)).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (doc) {
      if (doc && doc.book) return doc.book;
      return doc;
    });
  }

  function downloadField(value) {
    return String(value == null ? "" : value).trim();
  }

  function bookHasLinks(book) {
    if (!book) return false;
    return !!(
      downloadField(book.u) ||
      downloadField(book.q) ||
      downloadField(book.link) ||
      downloadField(book.quark_link)
    );
  }

  function overlayDownloadFields(target, source) {
    if (!target || !source) return target;
    var u = downloadField(source.u) || downloadField(source.link);
    var q = downloadField(source.q) || downloadField(source.quark_link);
    if (!downloadField(target.u) && u) target.u = u;
    if (!downloadField(target.q) && q) target.q = q;
    if (!target.pw && source.pw && u) target.pw = source.pw;
    if (!target.qp && source.qp && q) target.qp = source.qp;
    return target;
  }

  function postBookClick(book) {
    if (!book || isFilePage() || typeof window.fetch !== "function") return;
    var id = clickBookId(book);
    if (!id) return;
    fetch("/api/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: id })
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (doc) {
        if (!doc || !doc.ok) return;
        var next =
          doc.count != null ? parseClicks(doc.count) : parseClicks(book.clicks) + 1;
        setVisibleClicks(id, next);
        refreshHomeRankedAfterClick();
      })
      .catch(function () {});
  }

  // 下载弹窗同时展示中文译名与英文原题：
  // 中文界面主标题为中文、副标题为英文原题；英文界面反过来（cardHeading 在英文界面
  // 只给英文，这里补上中文译名）。原题是 arXiv 编号等无效标题时只显示一行。
  function dialogTitles(book) {
    var names = cardHeading(book);
    var primary = names.primary;
    var secondary = names.secondary || "";
    if (!secondary && currentLang === "zh-CN") {
      var zh = trimText(book && (book.zh || book.title_zh));
      if (!isRealTitle(zh)) zh = "";
      if (zh && zh !== primary) secondary = zh;
    }
    return { primary: primary, secondary: secondary };
  }

  function showDownloadSheet(book) {
    var modal = ensureDownloadModal();
    dlModal.book = book;
    dlModalLastFocus = document.activeElement;
    var titles = dialogTitles(book);
    modal.title.textContent = titles.primary;
    if (modal.subtitle) {
      modal.subtitle.textContent = titles.secondary;
      modal.subtitle.hidden = !titles.secondary;
    }
    var parts = [];
    var dialogAuthor = book.a ? authorLabel(book.a) : "";
    if (dialogAuthor && !isUnknownAuthor(dialogAuthor)) parts.push(dialogAuthor);
    if (book.e) parts.push(String(book.e).toUpperCase());
    if (book.z) parts.push(formatSize(book.z));
    parts.push(languageLabel(languageOf(book)));
    modal.meta.textContent = parts.join(" · ");
    modal.links.textContent = "";
    var hasAny = false;
    var ctLink = downloadField(book.u) || downloadField(book.link);
    var quarkLink = downloadField(book.q) || downloadField(book.quark_link);
    var quarkPass = book.qp || book.quark_password || "";
    if (ctLink) {
      appendDownloadRow(modal.links, book.fl ? t("modalFolder") : t("modalCtfile"), ctLink, book.pw);
      hasAny = true;
    }
    if (quarkLink) {
      appendDownloadRow(modal.links, t("modalQuark"), quarkHref(quarkLink, quarkPass), quarkPass);
      hasAny = true;
    }
    if (!hasAny) {
      var empty = document.createElement("p");
      empty.className = "dl-empty";
      empty.textContent = t("modalNoLink");
      modal.links.appendChild(empty);
    }
    modal.overlay.hidden = false;
    document.documentElement.classList.add("dl-open");
    modal.close.focus();
  }

  function openDownloadDialog(book) {
    if (!book) return;
    showDownloadSheet(book);
    if (bookHasLinks(book) || isFilePage() || typeof window.fetch !== "function") return;
    var id = clickBookId(book);
    if (!id) return;
    fetchBookRecord(id)
      .then(function (fetched) {
        if (!fetched || (dlModal && dlModal.book !== book)) return;
        overlayDownloadFields(book, normalizeBook(fetched) || fetched);
        if (!bookHasLinks(book)) return;
        showDownloadSheet(book);
      })
      .catch(function () {});
  }

  // ==================================================================
  // 复制链接 / 提取码 / Toast
  // ==================================================================
  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.remove("show");
      dom.toast.hidden = true;
    }, 2200);
  }

  function copyViaExecCommand(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(area);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyViaExecCommand(text);
      });
    }
    return copyViaExecCommand(text);
  }

  function copyPayload(url, password) {
    // 城通分享链接已经包含提取码（?p=xxx），复制时只复制链接本身
    return url;
  }

  function flashButton(button, doneText, normalText) {
    var original = normalText || button.textContent;
    button.textContent = doneText;
    button.disabled = true;
    setTimeout(function () {
      button.textContent = original;
      button.disabled = false;
    }, 1500);
  }

  function copyLink(url, password, button) {
    copyText(copyPayload(url, password))
      .then(function () {
        flashButton(button, t("copied"), button.textContent);
        showToast(password ? t("linkCopiedCode") : t("linkCopied"));
      })
      .catch(function () {
        showToast(t("copyFailed"));
      });
  }

  function copyPassword(password, button) {
    copyText(password)
      .then(function () {
        flashButton(button, t("codeCopiedBtn"), t("codeBtn").replace("{code}", password));
        showToast(t("codeCopiedToast").replace("{code}", password));
      })
      .catch(function () {
        showToast(t("codeCopyFailed"));
      });
  }

  // ==================================================================
  // 深色 / 浅色模式切换（右上角按钮，记忆到 localStorage）
  // ==================================================================
  var THEME_KEY = "ebook-vault-theme";

  function currentTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    return attr === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    var dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      } catch (e) {
        /* 隐私模式 / 禁用存储时忽略 */
      }
    }
    if (dom.themeToggle) {
      dom.themeToggle.textContent = dark ? "☀️" : "🌙";
      var label = dark ? t("themeToLight") : t("themeToDark");
      dom.themeToggle.setAttribute("aria-label", label);
      dom.themeToggle.setAttribute("title", label);
      dom.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#2a241e" : "#f8f5ee");
  }

  function bindTheme() {
    applyTheme(currentTheme(), false);
    if (dom.themeToggle) {
      dom.themeToggle.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
      });
    }
  }

  // ==================================================================
  // 事件绑定
  // ==================================================================
  function resetAll() {
    if (PAPERS_PAGE) {
      papersSubjects.clear();
      papersYear = "";
      papersLang = "";
      if (dom.q) dom.q.value = "";
      state.tokens = [];
      paintPapersFilters();
      render(true);
      return;
    }
    state.categories.clear();
    state.onlyDownloadable = false;
    if (dom.onlyDownloadable) dom.onlyDownloadable.checked = false;
    if (dom.q) dom.q.value = "";
    state.tokens = [];
    refreshChips();
    render(true);
  }

  function bindBackToTop() {
    if (!dom.toTop) return;
    dom.toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    var update = function () {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      dom.toTop.classList.toggle("show", y > 560);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  // Multi-column desktop hover is 1.1. One-column / one-row / ≤720px uses 1.04.
  // If the scaled box would leave the visual viewport (or go under sticky
  // header/search), shift with translate so it stays inside.
  var CARD_HOVER_SCALE = 1.1;
  var CARD_HOVER_SCALE_COMPACT = 1.04;
  var CARD_HOVER_MARGIN = 8;
  var fittedCard = null;

  function hoverMediaOk() {
    return !window.matchMedia || window.matchMedia("(hover: hover)").matches;
  }

  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function visualViewportBox() {
    var vv = window.visualViewport;
    if (vv) {
      return {
        left: vv.offsetLeft,
        top: vv.offsetTop,
        right: vv.offsetLeft + vv.width,
        bottom: vv.offsetTop + vv.height
      };
    }
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }

  function cardLayoutRect(card) {
    var prev = card.style.transform;
    card.style.transform = "none";
    var rect = card.getBoundingClientRect();
    card.style.transform = prev;
    return rect;
  }

  function stickyTopCover(view, cardTop) {
    var top = view.top;
    var nodes = document.querySelectorAll(".topbar, .search-well");
    for (var i = 0; i < nodes.length; i += 1) {
      var r = nodes[i].getBoundingClientRect();
      if (r.bottom <= view.top || r.top >= view.bottom) continue;
      if (r.top <= top + 2 || r.bottom <= cardTop + 1) {
        top = Math.max(top, r.bottom);
      }
    }
    return top;
  }

  function axisShift(start, size, min, max) {
    if (max <= min) return 0;
    if (size >= max - min) return (min + max) / 2 - (start + size / 2);
    var shift = 0;
    if (start < min) shift += min - start;
    if (start + size + shift > max) shift -= start + size + shift - max;
    return shift;
  }

  function gridColumnCount() {
    if (!dom.grid) return 1;
    var cols = window.getComputedStyle(dom.grid).gridTemplateColumns;
    if (!cols || cols === "none") return 1;
    return cols.split(" ").filter(Boolean).length;
  }

  function gridIsSingleRow() {
    if (!dom.grid) return true;
    var cards = dom.grid.querySelectorAll(".card");
    if (cards.length <= 1) return true;
    var firstTop = cards[0].getBoundingClientRect().top;
    for (var i = 1; i < cards.length; i += 1) {
      if (Math.abs(cards[i].getBoundingClientRect().top - firstTop) > 2) return false;
    }
    return true;
  }

  function compactHoverLayout() {
    if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) return true;
    if (gridColumnCount() <= 1) return true;
    return gridIsSingleRow();
  }

  function hoverScale() {
    return compactHoverLayout() ? CARD_HOVER_SCALE_COMPACT : CARD_HOVER_SCALE;
  }

  function fitCardToViewport(card) {
    if (!hoverMediaOk() || reduceMotion()) return;
    var layout = cardLayoutRect(card);
    var w = layout.width;
    var h = layout.height;
    if (w <= 0 || h <= 0) return;

    var view = visualViewportBox();
    if (
      layout.bottom < view.top ||
      layout.top > view.bottom ||
      layout.right < view.left ||
      layout.left > view.right
    ) {
      return;
    }

    var scale = hoverScale();
    var minX = view.left + CARD_HOVER_MARGIN;
    var maxX = view.right - CARD_HOVER_MARGIN;
    var minY = stickyTopCover(view, layout.top) + CARD_HOVER_MARGIN;
    var maxY = view.bottom - CARD_HOVER_MARGIN;

    var scaledW = w * scale;
    var scaledH = h * scale;
    var sLeft = layout.left - (scaledW - w) / 2;
    var sTop = layout.top - (scaledH - h) / 2;
    var tx = axisShift(sLeft, scaledW, minX, maxX);
    var ty = axisShift(sTop, scaledH, minY, maxY);
    card.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + scale + ")";
  }

  function clearCardFit(card) {
    if (!card) return;
    card.style.removeProperty("transform");
    if (fittedCard === card) fittedCard = null;
  }

  function bindCardHoverFit() {
    var grids = [];
    if (dom.grid) grids.push(dom.grid);
    if (dom.pickedGrid) grids.push(dom.pickedGrid);
    if (!grids.length) return;

    var enter = function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var card = target.closest(".card");
      if (!card || !card.closest(".grid")) return;
      if (fittedCard && fittedCard !== card) clearCardFit(fittedCard);
      fittedCard = card;
      fitCardToViewport(card);
    };

    var leave = function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var card = target.closest(".card");
      if (!card || card !== fittedCard) return;
      var next = event.relatedTarget;
      if (next instanceof Node && card.contains(next)) return;
      clearCardFit(card);
    };

    for (var g = 0; g < grids.length; g += 1) {
      grids[g].addEventListener("mouseenter", enter, true);
      grids[g].addEventListener("mouseleave", leave, true);
      grids[g].addEventListener("focusin", enter);
      grids[g].addEventListener("focusout", leave);
    }

    var refit = function () {
      if (fittedCard) fitCardToViewport(fittedCard);
    };
    window.addEventListener("resize", refit);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", refit);
      window.visualViewport.addEventListener("scroll", refit);
    }
  }

  function bindLang() {
    var root = document.getElementById("lang-switch");
    if (!root) return;
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest(".lang-btn");
      if (!button || !root.contains(button)) return;
      applyLanguage(currentLang === "zh-CN" ? "en" : "zh-CN", true);
    });
  }

  function filtersOnTop() {
    return window.matchMedia("(max-width: 980px)").matches;
  }

  function focusWithoutScroll(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      el.focus();
    }
  }

  // 只在筛选条位于顶部时打开弹窗。完成、遮罩、Esc 都只是关掉弹窗，已选条件保持生效。
  function setFiltersOpen(open, silent) {
    var root = document.getElementById("filters");
    var dialog = document.getElementById("filters-dialog");
    var opener = document.getElementById("filters-open");
    if (!root || !dialog || !opener) return;
    var top = filtersOnTop();
    if (open && !top) return;
    var was = root.classList.contains("is-open");
    if (!open && !was) return;
    root.classList.toggle("is-open", !!open);
    opener.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("filters-modal-open", !!open);
    if (open) {
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      if (!silent) focusWithoutScroll(dialog);
    } else {
      dialog.removeAttribute("role");
      dialog.removeAttribute("aria-modal");
      if (!silent && was && top) focusWithoutScroll(opener);
    }
  }

  function filtersPopupHandlesKey(event) {
    var root = document.getElementById("filters");
    if (!root || !root.classList.contains("is-open")) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setFiltersOpen(false);
      return true;
    }
    if (event.key !== "Tab") return false;
    var dialog = document.getElementById("filters-dialog");
    if (!dialog) return true;
    var nodes = dialog.querySelectorAll("button:not([disabled]), input, select, textarea, a[href]");
    var list = [];
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].getClientRects().length) list.push(nodes[i]);
    }
    if (!list.length) return true;
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
    return true;
  }

  function bindPapersFilters() {
    if (!PAPERS_PAGE) return;
    var yearRoot = document.getElementById("papers-year");
    var yearButton = document.getElementById("papers-year-btn");
    var yearMenu = document.getElementById("papers-year-menu");
    if (yearButton && yearMenu) {
      yearButton.addEventListener("click", function (event) {
        event.stopPropagation();
        var open = yearButton.getAttribute("aria-expanded") === "true";
        setPapersYearOpen(!open);
      });
      yearMenu.addEventListener("click", function (event) {
        event.stopPropagation();
        var target = event.target;
        if (!(target instanceof Element)) return;
        var option = target.closest(".papers-year-option");
        if (!option || !yearMenu.contains(option)) return;
        papersYear = option.dataset.value || "";
        setPapersYearOpen(false);
        paintPapersFilters();
        render(true);
      });
    }
    document.addEventListener("click", function (event) {
      if (!yearRoot) return;
      var target = event.target;
      if (target instanceof Node && yearRoot.contains(target)) return;
      setPapersYearOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setPapersYearOpen(false);
    });
    var subjects = document.getElementById("papers-subjects");
    if (subjects) {
      subjects.addEventListener("click", function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var button = target.closest("button.chip");
        if (!button || !subjects.contains(button) || button.classList.contains("chip-static")) return;
        var value = button.dataset.value || "";
        if (!value || isIdleCategory(value)) return;
        if (papersSubjects.has(value)) papersSubjects.delete(value);
        else papersSubjects.add(value);
        paintPapersFilters();
        render(true);
      });
    }
    if (dom.papersClear) {
      dom.papersClear.addEventListener("click", function () {
        papersSubjects.clear();
        papersYear = "";
        paintPapersFilters();
        render(true);
      });
    }
    var pagerPrev = document.getElementById("papers-prev");
    var pagerNext = document.getElementById("papers-next");
    if (pagerPrev) {
      pagerPrev.addEventListener("click", function () {
        gotoPaperPage(papersApiPage - 1);
      });
    }
    if (pagerNext) {
      pagerNext.addEventListener("click", function () {
        gotoPaperPage(papersApiPage + 1);
      });
    }
  }

  function bindFiltersPopup() {
    var opener = document.getElementById("filters-open");
    var done = document.getElementById("filters-done");
    var backdrop = document.getElementById("filters-backdrop");
    if (opener) {
      opener.addEventListener("click", function () {
        var root = document.getElementById("filters");
        setFiltersOpen(!(root && root.classList.contains("is-open")));
      });
    }
    if (done) {
      done.addEventListener("click", function () {
        setFiltersOpen(false);
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setFiltersOpen(false);
      });
    }
  }

  function bindEvents() {
    bindTheme();
    bindLang();
    bindFiltersPopup();
    window.addEventListener("resize", syncNarrowHeader);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        syncNarrowHeader();
      });
    }

    if (dom.q) {
      dom.q.addEventListener("input", onQueryEdited);
      dom.q.addEventListener("search", onQueryEdited);
    }

    if (dom.onlyDownloadable) {
      dom.onlyDownloadable.addEventListener("change", function () {
        state.onlyDownloadable = dom.onlyDownloadable.checked;
        updateFilterChrome();
        render(true);
      });
    }

    if (dom.clearFilters) dom.clearFilters.addEventListener("click", resetAll);
    if (dom.emptyReset) dom.emptyReset.addEventListener("click", resetAll);
    if (dom.emptyRetry) dom.emptyRetry.addEventListener("click", retryFailedRequest);

    if (dom.loadMore) {
      dom.loadMore.addEventListener("click", function () {
        render(false);
      });
    }

    var resultGrids = [];
    if (dom.grid) resultGrids.push(dom.grid);
    if (dom.pickedGrid) resultGrids.push(dom.pickedGrid);
    for (var gi = 0; gi < resultGrids.length; gi += 1) {
      resultGrids[gi].addEventListener("click", function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var passwordChip = target.closest("button.password-chip");
        if (passwordChip) {
          event.preventDefault();
          event.stopPropagation();
          copyPassword(passwordChip.dataset.password, passwordChip);
          return;
        }
        var copyButton = target.closest("button.copy");
        if (copyButton) {
          event.preventDefault();
          event.stopPropagation();
          copyLink(copyButton.dataset.url, copyButton.dataset.password, copyButton);
          return;
        }
        var card = target.closest(".card");
        var book = card && card._book;
        var downloadButton = target.closest(".btn.download");
        if (downloadButton) {
          event.stopPropagation();
          event.preventDefault();
          openDownloadDialog(book);
          return;
        }
        if (target.closest("a, button")) return;
        if (!book) return;
        openDownloadDialog(book);
      });

      resultGrids[gi].addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("a, button")) return;
        var card = target.closest(".card");
        var book = card && card._book;
        if (!book) return;
        event.preventDefault();
        openDownloadDialog(book);
      });
    }

    bindPapersFilters();
    bindHomeCategories();
    bindHomeCategoryToggle();
    bindPapersFilterToggle();
    bindChips(dom.categoryChips, state.categories);
    bindBackToTop();
    bindCardHoverFit();

    document.addEventListener("keydown", function (event) {
      if (filtersPopupHandlesKey(event)) return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (dlModal && dlModal.overlay && !dlModal.overlay.hidden) return;
        if (catModal && catModal.overlay && !catModal.overlay.hidden) return;
        if (homeCatModal && homeCatModal.overlay && !homeCatModal.overlay.hidden) return;
        if (papersFilterModal && papersFilterModal.overlay && !papersFilterModal.overlay.hidden) return;
        var active = document.activeElement;
        var typing =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.tagName === "SELECT" ||
            active.isContentEditable);
        if (!typing && dom.q) {
          event.preventDefault();
          dom.q.focus();
          dom.q.select();
        }
        return;
      }
      if (event.key === "Escape" && dlModal && dlModal.overlay && !dlModal.overlay.hidden) {
        return;
      }
      if (event.key === "Escape" && catModal && catModal.overlay && !catModal.overlay.hidden) {
        return;
      }
      if (event.key === "Escape" && homeCatModal && homeCatModal.overlay && !homeCatModal.overlay.hidden) {
        return;
      }
      if (event.key === "Escape" && papersFilterModal && papersFilterModal.overlay && !papersFilterModal.overlay.hidden) {
        return;
      }
      if (event.key === "Escape" && dom.q) {
        if (dom.q.value) {
          dom.q.value = "";
          state.tokens = [];
          state.categories.clear();
          renderNow();
        } else if (state.categories.size) {
          state.categories.clear();
          renderNow();
        } else if (document.activeElement === dom.q) {
          dom.q.blur();
        }
      }
    });
  }

  // ==================================================================
  // 启动
  // ==================================================================
  // 结果栏贴在顶栏正下方。窄屏顶栏会变成两行，高度不固定，所以量真实高度。
  // 顶部筛选时册数跟在筛选按钮同一行，工具条不计入顶栏高度。
  function syncHeaderOffset() {
    var header = document.querySelector(".topbar");
    if (header) {
      var height = Math.ceil(header.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty("--header-h", height + "px");
    }
    if (!filtersOnTop()) setFiltersOpen(false, true);
  }

  function watchHeaderOffset() {
    syncHeaderOffset();
    window.addEventListener("resize", syncHeaderOffset);
    if (typeof ResizeObserver === "function") {
      var header = document.querySelector(".topbar");
      if (header) new ResizeObserver(syncHeaderOffset).observe(header);
    }
    if (window.matchMedia) {
      var query = window.matchMedia("(max-width: 980px)");
      if (query.addEventListener) query.addEventListener("change", syncHeaderOffset);
      else if (query.addListener) query.addListener(syncHeaderOffset);
    }
  }

  function init() {
    watchHeaderOffset();
    settleSort();
    applyLanguage(readLang(), false);
    bindEvents();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ===== file:// 本地浏览兜底：无扩展名链接自动补 .html ===== */
(function(){
  if (typeof location === "undefined" || location.protocol !== "file:") return;
  function fix(href){
    if (!href) return href;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#|javascript:)/i.test(href)) return href;
    var hash="", i=href.indexOf("#");
    if (i>=0){ hash=href.slice(i); href=href.slice(0,i); }
    if (!href) return href;
    var segs=href.split("/"), last=segs[segs.length-1];
    if (last==="" || last==="." || last==="..") return href.replace(/\/?$/, "/index.html")+hash;
    if (!/\.[a-z0-9]+$/i.test(last)) return href+".html"+hash;
    return href+hash;
  }
  function fixAttr(el, name){
    var h=el.getAttribute(name); if(!h) return;
    var fixed=fix(h); if(fixed && fixed!==h) el.setAttribute(name, fixed);
  }
  function apply(){
    [].forEach.call(document.querySelectorAll("a[href]"), function(a){ fixAttr(a,"href"); });
    [].forEach.call(document.querySelectorAll("[data-href]"), function(el){ fixAttr(el,"data-href"); });
  }
  document.addEventListener("click", function(e){
    var t=e.target;
    if(!t || !t.closest) return;
    var a=t.closest("a[href]"); if(a) fixAttr(a,"href");
    var c=t.closest("[data-href]"); if(c) fixAttr(c,"data-href");
  }, true);
  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  try{ new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
})();
