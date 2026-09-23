// =====================================================================
// scene · HTML 下游的几何缓存(决策权威在 HTML, 这里只存可重建的度量产物)
//
// 两条契约(设计稿 §4.1 / §4.2)钉死了这个文件存在的理由:
//
// ① **决策权威单源在 HTML**: 层 / 层内顺序 / 分组 / 方向只活在 DOM 的父子关系与 class 里;
//    scene 存度量产物(bounds)、边表与诊断快照, 是**可重建的缓存**, 不是决策源。
//    所以这里没有、也不许有 order / group 之类的决策字段 —— 要改序就改 HTML 再重测。
//
// ② **scene 过期是定时炸弹**: 两类事故都真发生过 ——
//    (a) agent 手改 bounds 后又重测, 手改值被静默覆盖;
//    (b) agent 改了 HTML 忘了重测, export 出旧 bounds。
//    焊法 = 版本号 + 逐节点来源: HTML 落盘推进 `html_rev`, 几何写回推进 `scene_rev`,
//    每节点带 `bounds_source`。写回遇 `manual` 节点跳过并报 warning(`force` 才覆盖);
//    遇 `estimate` 节点**不许跳过**(blink 回归时它就是该被覆盖的那个, 与 manual 规则相反);
//    export 前陈旧缓存一律拦下, 不许静默出图。
//
// **版本号语义**: `html_rev` 与 `scene_rev` 共用**一条单调时间线**, 每次推进取 `max(两值) + 1`,
// 不是各自独立自增。理由是个可复现的反例: 连续重测两次(`scene_rev` 追过 `html_rev`)之后
// agent 改了 HTML —— 独立自增的实现会算出 `html_rev <= scene_rev` 而放行, 恰好漏掉上面第 (b) 类事故。
//
// **②′ 源指纹(260918 升级, 判决优先看它)**: 计数只知道"落过盘", 说不出"内容变没变" ——
// 同一轮编辑里改了又改回, 计数看着仍然陈旧(反过来, 内容没变的重存也被判陈旧)。
// 于是判决换口径: `html_hash` = 当前决策源的 `sha256(语义字段)`, `scene_hash` = **最近一次写回时**
// 那一版源的指纹; 两侧都在就只比指纹(相等 = 缓存量的正是这一版源 → 放行), 缺任一侧才降级回计数
// 比较并出 warning(旧文档兼容, 不破坏既有数据)。决策源由调用方交给 `markHtmlChanged(scene, source)`:
// 一段源文本(HTML / JSON)或结构化语义字段 —— core 不读盘也不解析 HTML, 它只负责把这份输入
// 规范化成**字节确定**的指纹(CRLF / 行尾空白 / HTML 注释 / 键顺序 一律不进哈希)。
// `html_rev`/`scene_rev` 保留: 旧文档降级比较 + 人读时序。
// 回归: test/scene.test.ts 的"源指纹"五条用例。
//
// 全部函数是纯函数: 不 mutate 入参, 一律返回新对象 —— 便于 JSON 字节比对与 golden。
// =====================================================================

import { type Rect, codepointSort, rectBottom, rectRight, round1 } from './geometry/vec';
import { type Diagnostic, type Scene, type SceneGroup, type SceneNode as AuditSceneNode, groupLabelBox } from './knives/audit';
import { GROUP_FIT_PAD, type ClusterTier, declaredMemberIds, isDeclaredFrame, memberRef } from './knives/cluster';

// --- 契约类型 ----------------------------------------------------------

/**
 * bounds 的来源。三层含义必须分开: **谁写的** / **能不能被重测覆盖** / **能不能进交付图**。
 * · `layout`: blink(CDP 真渲染)实测值 —— 唯一能进交付图的来源, 重测时正常覆盖
 * · `manual`: 作者手改值 —— 重测时跳过(作者特权), 只 `force` 能覆盖
 * · `estimate`: core 宽度表估算值(无浏览器路径) —— 只出草稿图, blink 回归时全量重测
 */
export type BoundsSource = 'layout' | 'manual' | 'estimate';

/**
 * 决策源: 一段源文本(HTML / JSON / mmd)或一份**结构化语义描述**
 * (节点/边的 id、层级、成员声明、分组档…… 凡是从 HTML 里的决策抽出来的字段)。
 * core 不读盘、不解析 HTML —— 谁来抽这份描述是调用方的事, 这里只管把它压成字节确定的指纹。
 */
export type DecisionSource = string | readonly unknown[] | { readonly [k: string]: unknown };

/** 判决依据: `source-hash`(指纹, 精确) / `counter`(旧格式降级, 分不清"源变了"与"重存了一次") */
export type FreshnessBasis = 'source-hash' | 'counter';

/** 陈旧的两副面孔 —— 修法不同, 报错就得分开 */
export type StaleReason =
  /** 两侧指纹不等: 决策源内容确实变过(结论确定, 去重测) */
  | 'source-changed'
  /** 旧格式无指纹可比: 只能按计数猜(可能与"源变了"同因, 也可能只是重存了一次) */
  | 'counter-degraded';

/**
 * scene 节点 = audit 的节点形状 + `bounds_source`。
 * 只加这一个可选字段是为了让 `SceneDoc` 仍能原样喂 `audit` / `exportScene`(见 test 的结构兼容用例)
 * —— 缓存戳与来源只属于"缓存"这层, 不进 audit 的几何契约。
 *
 * 反过来的方向也成立: 几何与**语义**(如 `tone` / `variant` / `shape`, 见 `audit.ts` 的 `SceneNode`)
 * 是同一份 scene 契约, 所以加在 audit 侧 —— 渲染面与审计面读的必须是**同一个类型**,
 * 否则又会长出"两边各记一份"的老病。边侧同理(`SceneEdge.tone`)。
 */
export type SceneNode = AuditSceneNode & { bounds_source?: BoundsSource };

/**
 * 缓存有效期: 一条单调时间线(双计数器) + 一对源指纹。
 *
 * 指纹是**首选**判据(`html_hash` = 当前决策源 / `scene_hash` = 最近一次写回时那一版源),
 * 任一缺失即降级为计数比较并出 warning —— 旧文档原样可用, 不破坏既有数据。
 */
export type SceneStamp = {
  html_rev: number;
  scene_rev: number;
  /** 当前决策源的 sha256(见 `decisionDigest`); 旧文档没有 = 降级计数比较 */
  html_hash?: string;
  /** 最近一次几何写回时那一版源的 sha256 —— 缓存"量的是哪一版源" */
  scene_hash?: string;
};

/** HTML 下游的几何缓存文档: 与 audit 的 `Scene` 结构兼容, 多出 stamp 与逐节点来源 */
export type SceneDoc = Omit<Scene, 'nodes'> & SceneStamp & { nodes: SceneNode[] };

/** `createScene` 的入参: 几何 + 可选缓存戳(传回一份已有 SceneDoc 不会把版本号清零) */
export type SceneInput = Omit<Scene, 'nodes'> & Partial<SceneStamp> & { nodes: SceneNode[] };

export type CreateSceneOptions = {
  /** 从磁盘恢复缓存时的初始修订号; 缺省沿用入参自带的(没有则 0) */
  html_rev?: number;
  scene_rev?: number;
  /** 源指纹; 与修订号同规矩: 缺省沿用入参自带的(传回一份已有 SceneDoc 不会把指纹抹掉) */
  html_hash?: string;
  scene_hash?: string;
  /** 给**未声明来源**的节点统一打的标; 缺省 `'estimate'`(理由见 createScene) */
  bounds_source?: BoundsSource;
  /** 组语义档; 缺省 `'set'`(平铺集合)。`'tree'` 是 opt-in —— 它额外启用"框包含 ⇒ 成员包含"那条门禁 */
  clusterTier?: ClusterTier;
};

/** 一次几何写回: 写哪个节点、写成什么、来源是谁 */
export type BoundsPatch = {
  id: string;
  rect: Rect;
  /**
   * 本次写回的来源。**缺省沿用节点原有来源**, 不是 `'layout'` ——
   * 与 `createScene` 的保守默认同向: 调用方忘传时, 估算值不许被静默升格成实测值。
   * 唯一例外: `force` 覆盖 `manual` 节点时缺省取 `'layout'`(force 的语义就是"信量框值")。
   */
  source?: BoundsSource;
};

export type ApplyBoundsResult = {
  scene: SceneDoc;
  /** 真正写进去的节点 id(按 patch 顺序) */
  applied: string[];
  /** 被跳过 / 目标缺失的写回, 一律是诊断四元组形状, 可直接并进 export 报告(带 supportedFixes) */
  warnings: Diagnostic[];
};

export type SceneStatus = {
  html_rev: number;
  scene_rev: number;
  /** 当前决策源 / 最近写回那一版源的指纹(旧文档为 undefined —— 见 `freshness_basis`) */
  html_hash?: string;
  scene_hash?: string;
  /** 这次判决用的依据: `source-hash`(指纹, 精确) / `counter`(旧格式降级, 会误报"改了又改回") */
  freshness_basis: FreshnessBasis;
  /** true = 缓存量与当前源对不上 —— 不许出图 */
  stale: boolean;
  /** 各来源的节点数(一眼看这份缓存有多少是实测的) */
  bounds_sources: Record<BoundsSource, number>;
  /** 还是估算值的节点 id —— 交付图不许含它(设计稿 §4.2: estimate 只出草稿图) */
  estimated_nodes: string[];
  /** 降级提示(诊断四元组形状, 带 supportedFixes)。有修订史却只能靠计数判 → 一条 `scene_hash_missing` */
  warnings: Diagnostic[];
};

/** 陈旧缓存的出口拦停(与 `ExportBlockedError` 同风格: 报错带得动判断所需的值) */
export class SceneStaleError extends Error {
  readonly html_rev: number;
  readonly scene_rev: number;
  readonly html_hash?: string;
  readonly scene_hash?: string;
  /** 哪一副陈旧面孔: 源真变了 / 旧格式只能按计数猜(两种修法不同, 报错必须分开) */
  readonly reason: StaleReason;
  constructor(stamp: SceneStamp) {
    const reason = staleReason(stamp);
    super(
      reason === 'source-changed'
        ? `scene 缓存陈旧(源指纹 ${shortHash(stamp.html_hash)} ≠ ${shortHash(stamp.scene_hash)}): ` +
            '决策源在上次重测之后变过, 现在出图会带上旧 bounds —— 先重测写回再 export'
        : `scene 缓存陈旧(旧格式无源指纹, 只能按计数判: html_rev ${stamp.html_rev} > scene_rev ${stamp.scene_rev}): ` +
            'HTML 在最近一次几何写回之后又落过盘 —— 计数分不清"决策源真的改了"与"只是重存了一次' +
            '(上次重测仍然有效)", 保险起见拦下; 带源重测写回一次即升级为指纹判据',
    );
    this.name = 'SceneStaleError';
    this.reason = reason;
    this.html_rev = stamp.html_rev;
    this.scene_rev = stamp.scene_rev;
    this.html_hash = stamp.html_hash;
    this.scene_hash = stamp.scene_hash;
  }
}

/** 指纹只报前 12 位 —— 够人对账, 不刷屏 */
const shortHash = (h?: string): string => (h ? h.slice(0, 12) : '无');

// --- 版本号与源指纹(判决: 指纹优先, 计数兜底) -------------------------

/** 修订号推进: 取 `max(html_rev, scene_rev) + 1` —— 两个计数器数的是同一条时间线上的事件 */
const advanceTimeline = (stamp: SceneStamp): number => Math.max(stamp.html_rev, stamp.scene_rev) + 1;

/** 判决依据: **两侧指纹齐了才配指纹判**; 缺任一侧 = 旧格式, 降级计数 */
const freshnessBasis = (stamp: SceneStamp): FreshnessBasis =>
  stamp.html_hash && stamp.scene_hash ? 'source-hash' : 'counter';

/**
 * 陈旧判据: 指纹相等 = 缓存量的正是这一版源 —— 计数说"落过盘"也不算数(改了又改回不算陈旧,
 * 内容没变的重存也不算); 只有拿不到指纹时才退回"最近一次修订是不是 HTML 落盘"。
 */
const isStale = (stamp: SceneStamp): boolean =>
  freshnessBasis(stamp) === 'source-hash' ? stamp.html_hash !== stamp.scene_hash : stamp.html_rev > stamp.scene_rev;

/** 按判据给陈旧定性: 指纹不等是**确定的**"源变了"; 计数兜底说不出原因, 只报"降级" */
const staleReason = (stamp: SceneStamp): StaleReason =>
  freshnessBasis(stamp) === 'source-hash' ? 'source-changed' : 'counter-degraded';

/** 语义无关的键: 下划线 / `$` 前缀 + 注释类名 —— 改一句注释不该让缓存显得陈旧 */
const NON_SEMANTIC_KEY = /^(?:_|\$|comment|comments|note|notes)/i;

/**
 * 源文本 → 规范文本。四件事全是**排版**, 与决策无关, 所以一并抹掉:
 * CRLF / CR → LF、行尾空白去掉、HTML 注释剥掉、首尾空行去掉 + 统一收单个结尾换行。
 * **不重排缩进** —— 缩进在 HTML 里能表达层级, 那是决策, 不是排版。
 */
export function normalizeSourceText(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''));
  const body = lines.join('\n').replace(/^\n+|\n+$/g, '');
  return body.length ? `${body}\n` : '';
}

/** 结构化值的规范文本: 键 codepoint 序、语义无关键剔除、数 round1、undefined 丢弃; 数组保序(**序是决策**) */
function canonicalValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(round1(v)) : 'NaN';
  if (typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalValue).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = codepointSort(Object.keys(o).filter((k) => o[k] !== undefined && !NON_SEMANTIC_KEY.test(k)));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalValue(o[k])}`).join(',')}}`;
  }
  return 'null'; // 函数 / symbol 之类不是决策, 折成 null 不参与区分
}

/** 决策源 → 规范文本(既是哈希的输入, 也是人对账时该看的那串 —— 同一个源在任何机器上都是它) */
export const decisionSourceText = (source: DecisionSource): string =>
  typeof source === 'string' ? normalizeSourceText(source) : canonicalValue(source);

/** 决策源指纹: 规范文本的 sha256(hex, 64 位)。判据本体, 字节确定 —— 换机器换运行时都不许变 */
export const decisionDigest = (source: DecisionSource): string =>
  sha256Hex(new TextEncoder().encode(decisionSourceText(source)));

/** bun 内置 CryptoHasher 的最小结构签名 —— 不为它引 @types/bun(B 端浏览器 demo 也要能编译本文件) */
type HasherCtor = new (algorithm: string) => { update(data: Uint8Array): void; digest(encoding: 'hex'): string };

/**
 * sha256 hex。走 **bun 内置** `Bun.CryptoHasher`(同步, 零依赖)。
 * 刻意在**调用期**取构造器: scene 经 barrel 进浏览器 demo, import 期不许解析 bun 专有全局,
 * 只有真在浏览器里算指纹才报"需要 bun 运行时"(这条边界写在 README)。
 */
function sha256Hex(bytes: Uint8Array): string {
  const Ctor = (globalThis as { Bun?: { CryptoHasher?: HasherCtor } }).Bun?.CryptoHasher;
  if (!Ctor) throw new Error('源指纹需要 sha256: 本模块用 bun 内置 Bun.CryptoHasher —— 请在 bun 运行时下算指纹');
  const hasher = new Ctor('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
}

// --- 建缓存 / 标 HTML 变更 ---------------------------------------------

/**
 * 把一份几何(手写 golden / 宽度表估算 / 反序列化的缓存)采纳成 scene 缓存文档。
 *
 * · 已有 `bounds_source` 的节点**保留自己的标**(混合来源是常态: 估算了三个、手改了其中一个);
 *   未声明来源的一律按 `opts.bounds_source` 打标, 缺省 `'estimate'`。
 *   为什么默认是 estimate 而不是 layout: 没被 blink 量过的坐标不许冒充实测值。
 *   默认乐观(当作 layout)会让估算坐标直接进交付图; 默认保守只多出一次重测。
 * · 入参不带版本号时的 0/0 含义: 还没落过盘、也还没量过 —— 此时 `stale` 为 false,
 *   但 `bounds_sources` 会把"全是估算值"这件事说清楚(交付图另由 estimate 门槛把)。
 * · 源指纹与修订号同规矩: 缺省沿用入参自带的 —— 从磁盘恢复缓存**不许**把指纹抹掉
 *   (抹掉就等于把判决降级成计数, 白丢"改了又改回"那点分辨力)。
 * · 组侧三道**规范化**(不改语义, 只让文档自解释且字节确定):
 *   ① `clusterTier` 落缺省 `'set'` —— 两个语义档要**显式**选, `tree` 不许靠"没写"生效;
 *   ② `contains` 去重 + codepoint 序 —— JSON 对账不该取决于作者写声明的先后;
 *   ③ **声明了归属位的组, `labelRect` 落成派生值** —— 这是杀组框标签双源的那一刀: 作者写一次
 *      `labelPlacement` / `labelInset`(**输入**), 框体的标签盒(**产物**)由同一个 `labelAnchor` 派生,
 *      渲染面读同一个 placement。手写的 `labelRect` 在这条路上不占优 —— 两份值只留一份。
 *      不声明归属位的组**一个字都不动**(手工算框的老路仍在, 且缺省行为与过去逐字节相同)。
 * · **语义位不参与规范化**: `tone` / `variant` / `shape`(节点)与 `tone`(边)是作者写的**语义**
 *   (类型 → 肤色 / 形状), 不是可派生的缺失值 —— 这里是**刻意不管**它们: 不落缺省(落一个
 *   `'slate'` / `'rect'` 就等于替作者写了一条它没写过的决策, 还顺手抹掉"作者到底表没表态"这条
 *   信息; 真缺省在 `toneStyle` / `nodeShape` 里, 效果一致), 也不校验取值(取值是非几何事实,
 *   按决策 14 不该进诊断; 且这几位的类型已是词表类型, TS 侧就把错别字拦在了编译期)。
 *   规范化只做"让文档自解释且字节确定"那三件事。
 */
export function createScene(scene: SceneInput, opts: CreateSceneOptions = {}): SceneDoc {
  const fallback: BoundsSource = opts.bounds_source ?? 'estimate';
  return {
    ...scene,
    html_rev: opts.html_rev ?? scene.html_rev ?? 0,
    scene_rev: opts.scene_rev ?? scene.scene_rev ?? 0,
    html_hash: opts.html_hash ?? scene.html_hash,
    scene_hash: opts.scene_hash ?? scene.scene_hash,
    clusterTier: scene.clusterTier ?? opts.clusterTier ?? 'set',
    groups: scene.groups?.map(normalizeGroup),
    // 节点对象逐个换新实例: 采纳一份缓存不许改写原对象(原对象是调用方的)
    nodes: scene.nodes.map((n) => ({ ...n, bounds_source: n.bounds_source ?? fallback })),
  };
}

/**
 * 单个组的规范化(见 `createScene` 的 ②③)。**没东西可规范时原样返回入参实例** ——
 * 采纳一份缓存不该凭空换掉调用方手里的对象引用。
 */
function normalizeGroup(g: SceneGroup): SceneGroup {
  const placed = g.labelPlacement !== undefined || g.labelInset !== undefined;
  if (!placed && !g.contains) return g;
  const next: SceneGroup = placed ? { ...g, labelRect: groupLabelBox(g) } : { ...g };
  return g.contains ? { ...next, contains: codepointSort([...new Set(g.contains)]) } : next;
}

// --- 组框派生(membership 声明制的几何侧) ------------------------------

/**
 * 组框的**派生几何** = 声明成员的并集 + pad。
 *
 * 为什么框该是派生量: 手写框与手写成员迟早漂开(那正是 `cluster_member_outside` 要报的事);
 * 框由成员算出来就永远自洽。缺省 pad 走 `GROUP_FIT_PAD`(= 呼吸位门禁 + 4px 余量)——
 * **刚派生的框必然过 `cluster_border_clearance`**, 不必再调。
 *
 * **`frame: 'declared'` 的组不派生**: 它的 `rect` 是作者亲手给的框(泳道横铺全宽 / region 到 x = N 为止),
 * 成员并集从来不是它 —— 拿并集去覆盖作者的值, 等于把唯一的表达方式又删掉了。往下递归时同理:
 * 声明框的子框作为父框成员参与并集时, 用的是**它自己的框**, 不是它的成员并集。
 *
 * 成员是子框时**递归**派生(子框先算自己的框, 再作为父框的成员参与并集) —— 与 archify 同法;
 * 坐标始终是**全画布绝对值**, 不引入任何局部坐标系。
 * 未声明成员 / 声明的成员一个都不存在 / 出现循环引用 → `null`(推不出来就别说"框在哪")。
 */
export function deriveGroupRect(scene: Scene, groupId: string, opts: { pad?: number } = {}): Rect | null {
  const pad = opts.pad ?? GROUP_FIT_PAD;
  const seen = new Set<string>();
  const walk = (id: string): Rect | null => {
    if (seen.has(id)) return null; // 自指 / 互相引用: 派生不出来, 交给门禁去报
    seen.add(id);
    const g = (scene.groups ?? []).find((x) => x.id === id);
    if (!g) return null;
    if (isDeclaredFrame(g)) return g.rect; // 作者声明的框: 到此为止, 不被成员并集覆盖
    const refs = (declaredMemberIds(g) ?? [])
      .filter((mid) => mid !== id)
      .map((mid) => {
        const m = memberRef(scene, mid);
        if (!m) return null;
        return m.kind === 'node' ? m.rect : walk(mid);
      })
      .filter((r): r is Rect => r !== null);
    if (!refs.length) return null;
    const x = Math.min(...refs.map((r) => r.x));
    const y = Math.min(...refs.map((r) => r.y));
    return {
      x: round1(x - pad), y: round1(y - pad),
      w: round1(Math.max(...refs.map(rectRight)) - x + 2 * pad),
      h: round1(Math.max(...refs.map(rectBottom)) - y + 2 * pad),
    };
  };
  return walk(groupId);
}

/**
 * 把所有**声明了成员**的组框刷成派生值(组合器 `fit_group` 的批量形态)。
 *
 * ⚠ `frame: 'declared'` 的组**整个跳过**: 它的框是作者给的, 派生刷它就是把作者唯一的表达删掉。
 * (顺带, 这类组的标签位由 `labelPlacement` 现算, 不存在"过期 labelRect"的问题。)
 *
 * ⚠ 挪动过的组, 它的 `labelRect` 会被**丢掉** —— 那个矩形是按旧框算出来的, 留着就是让 audit
 * 去审一个图上不存在的标签(同族事故的根因: 审计面与渲染面漂开)。调用方要么用 `groupLabelRect()`
 * 重算, 要么明确接受这组暂时没有标签净空保护。(声明了 `labelPlacement` 的组不在此列: 它的标签位
 * 由 `groupLabelBox` 从当前 rect 现算, 框一挪标签就跟上。)
 * 未声明成员 / 派生不出几何的组**原样保留** —— 不许拿一个猜出来的框覆盖作者写的框。
 */
export function fitGroupFrames<T extends Scene>(scene: T, opts: { pad?: number } = {}): { scene: T; changed: string[] } {
  const changed: string[] = [];
  const groups: SceneGroup[] = (scene.groups ?? []).map((g) => {
    if (isDeclaredFrame(g)) return g; // 声明框: 作者说了算
    const rect = deriveGroupRect(scene, g.id, opts);
    if (!rect) return g;
    const same = rect.x === g.rect.x && rect.y === g.rect.y && rect.w === g.rect.w && rect.h === g.rect.h;
    if (same) return g;
    changed.push(g.id);
    return { ...g, rect, labelRect: undefined };
  });
  return changed.length ? { scene: { ...scene, groups }, changed } : { scene, changed };
}

/**
 * HTML 落盘了(决策变了) → 推进 `html_rev`, 并(给了源就)记下新源指纹。
 * 之后这份 scene 就是陈旧缓存: 几何还停在旧 DOM 上, 必须重测写回才许出图。
 *
 * · 带 `source`: 指纹取自源本身(源文本或结构化语义字段, 见 `decisionDigest`) —— 于是
 *   "改了又改回" **不算陈旧**(指纹回到写回时那一版), 而计数判据在这里只能误报。
 * · 不带 `source`: 调用方拿不出源内容 —— 此时**清掉 `html_hash`**, 宁可退回计数兜底,
 *   也不许留着旧指纹把真改动伪装成"源没变"(假新鲜正是这次升级要修的结构病)。
 */
export function markHtmlChanged(scene: SceneDoc, source?: DecisionSource): SceneDoc {
  return {
    ...scene,
    html_rev: advanceTimeline(scene),
    html_hash: source === undefined ? undefined : decisionDigest(source),
  };
}

// --- 几何写回 ----------------------------------------------------------

/**
 * 几何写回(blink 实测 / 宽度表估算 / 作者手改三条路共用一个入口)。逐 patch 判定:
 *
 * · 目标节点是 `manual` 且没给 `force` → **跳过**并报 warning(手改是作者特权, 不许被重测静默覆盖);
 *   覆盖的路只有一条: 显式 `force`
 * · 其余来源一律覆盖, `estimate` 不设任何保护 —— blink 回归时它就该被换掉(与 manual 的规则正好相反)
 * · 找不到目标节点 → warning 跳过: HTML 与 scene 已经分叉, 静默丢弃会把分叉藏起来
 *
 * 只有真的写进去至少一条 patch 才推进 `scene_rev` —— 几何没变, 缓存新鲜度就不该变。
 * 一条都没写进去时原样返回入参实例(调用方可用 `===` 判断"这次没动几何")。
 *
 * **来源缺省规则**(接 `BoundsPatch.source`): 沿用节点原有来源; `force` 覆盖 `manual` 节点时取 `layout`。
 * 旧版缺省写死 `'layout'`, 后果是估算路径忘传 source 就把 estimate 值升格成实测值直接进交付图。
 *
 * **写回即对齐源指纹**: 量的是当前 DOM(= 当前 `html_hash` 那一版源), 所以顺手把 `scene_hash`
 * 追平 `html_hash` —— 一次写回就把缓存判据从"陈旧"翻成"新鲜", 不必调用方再声明一次。
 * `html_hash` 缺失(旧文档 / 没给源)时保持缺失: 那时只有计数可比, 不许伪造指纹。
 */
export function applyBounds(
  scene: SceneDoc,
  patches: BoundsPatch[],
  opts: { force?: boolean } = {},
): ApplyBoundsResult {
  const force = opts.force ?? false;
  const warnings: Diagnostic[] = [];
  const applied: string[] = [];
  const replaced = new Map<number, SceneNode>();

  // 同一次调用里同一个 id 出现多次: 后写覆盖前写(按 patch 顺序最后一次生效)
  const lastPatch = new Map<string, { patch: BoundsPatch; index: number }>();
  patches.forEach((patch, index) => lastPatch.set(patch.id, { patch, index }));
  const indexOf = new Map(scene.nodes.map((n, i) => [n.id, i]));

  for (const [id, { patch, index }] of lastPatch) {
    const at = indexOf.get(id);
    if (at === undefined) {
      warnings.push(boundsTargetMissing(id, index));
      continue;
    }
    const node = scene.nodes[at];
    if (node.bounds_source === 'manual' && !force) {
      warnings.push(manualBoundsProtected(node));
      continue;
    }
    replaced.set(at, { ...node, rect: { ...patch.rect }, bounds_source: resolveSource(patch, node) });
    applied.push(id);
  }

  if (!applied.length) return { scene, applied, warnings };
  return {
    scene: {
      ...scene,
      nodes: scene.nodes.map((n, i) => replaced.get(i) ?? n),
      scene_rev: advanceTimeline(scene),
      scene_hash: scene.html_hash, // 写回即对齐当前源(见上方文档注释)
    },
    applied,
    warnings,
  };
}

/** 来源缺省: 沿用节点原有来源(缺失按 estimate); 仅当 force 从 manual 手里抢过控制权时取 layout */
function resolveSource(patch: BoundsPatch, node: SceneNode): BoundsSource {
  if (patch.source) return patch.source;
  if (node.bounds_source === 'manual') return 'layout';
  return node.bounds_source ?? 'estimate';
}

/** 手改值被保护: 这条 warning 的修法就是"要么什么都别做, 要么显式 force" */
function manualBoundsProtected(node: SceneNode): Diagnostic {
  return {
    code: 'manual_bounds_protected',
    severity: 'warning',
    message: `节点 ${node.id} 的 bounds 是手改值(bounds_source: manual), 本次写回已跳过; 确实要覆盖再显式 force`,
    subject: { kind: 'node', id: node.id },
    evidence: { bounds_source: 'manual', rect: [node.rect.x, node.rect.y, node.rect.w, node.rect.h] },
    supportedFixes: [
      { kind: 'keep-manual', hint: '手改值是对的: 什么都不做(默认行为); 若它该长期生效, 把改动写回 HTML 让决策与几何重新对齐' },
      { kind: 'force-overwrite', hint: '确定量框值更可信: 重测时加 --force 覆盖手改值' },
    ],
  };
}

/** 写回目标不在 scene 里: 这是"HTML 与 scene 分叉"的信号, 必须报出来 */
function boundsTargetMissing(id: string, index: number): Diagnostic {
  return {
    code: 'node_not_found',
    severity: 'warning',
    message: `写回目标节点 ${id} 不在 scene 里 —— HTML 与 scene 已经分叉, 这条 bounds 被丢弃`,
    subject: { kind: 'scene', id },
    evidence: { nodeId: id, patchIndex: index },
    supportedFixes: [
      { kind: 'remeasure', hint: '整体重测一遍: 节点增删之后 scene 要重建, 不要只补单点' },
      { kind: 'check-id', hint: `核对 HTML 里的节点 id 是否就是 ${id}(改名会让整份缓存失效, 需要整份重建)` },
    ],
  };
}

// --- 状态与出口门禁 ----------------------------------------------------

/**
 * 缓存状态一览: 修订号 / 指纹 / 判决依据 / 是否陈旧 / 各来源节点数 / 还是估算值的节点 id / 降级提示。
 * **两个门槛是分开的两件事, 不要混判**: 陈旧(`stale`)是硬拦(见 `assertFreshForExport`),
 * 尚有 `estimated_nodes` 是"只许出草稿图"(调低档位、产物打 draft), 不是拦死。
 * 注意 `bounds_source` 缺失的节点按 `estimate` 计(与 `createScene` 的缺省一致: 没量过的不许冒充实测)。
 * `freshness_basis` 说清这次判决的依据: 指纹判(精确)还是计数兜底(会误报"改了又改回")。
 */
export function sceneStatus(scene: SceneDoc): SceneStatus {
  const bounds_sources: Record<BoundsSource, number> = { layout: 0, manual: 0, estimate: 0 };
  const estimated_nodes: string[] = [];
  for (const n of scene.nodes) {
    const source: BoundsSource = n.bounds_source ?? 'estimate';
    bounds_sources[source] += 1;
    if (source === 'estimate') estimated_nodes.push(n.id);
  }
  const basis = freshnessBasis(scene);
  return {
    html_rev: scene.html_rev,
    scene_rev: scene.scene_rev,
    html_hash: scene.html_hash,
    scene_hash: scene.scene_hash,
    freshness_basis: basis,
    stale: isStale(scene),
    bounds_sources,
    estimated_nodes,
    // 有修订史却只能靠计数判 → 提醒判据退化; 一刀未动的 0/0 没什么可判, 不刷屏
    warnings: basis === 'counter' && (scene.html_rev > 0 || scene.scene_rev > 0) ? [hashBasisMissing(scene)] : [],
  };
}

/** 判据降级: 计数说不出"源真变了"与"只是重存了一次"的区别, 得让调用方知道自己在用弱判据 */
function hashBasisMissing(scene: SceneDoc): Diagnostic {
  return {
    code: 'scene_hash_missing',
    severity: 'warning',
    message:
      'scene 缺源指纹(html_hash / scene_hash), 缓存有效期降级为计数比较 —— ' +
      '计数分不清"决策源真的改了"与"只是重存了一次", 会把内容没变的落盘也判成陈旧',
    subject: { kind: 'scene', id: 'html_hash' },
    evidence: { html_rev: scene.html_rev, scene_rev: scene.scene_rev },
    supportedFixes: [
      { kind: 'declare-source', hint: 'HTML 落盘时带上源: markHtmlChanged(scene, 源文本 或 结构化语义字段)' },
      { kind: 'remeasure', hint: '再重测写回一次: scene_hash 会对齐 html_hash, 判据自动升级为指纹' },
    ],
  };
}

/**
 * export 前的硬门禁: 陈旧缓存**不许静默出图**。
 * 判据有两副面孔(见 `SceneStaleError.reason`): **指纹不等** = 源确实变了(确定);
 * 无指纹则退回计数 = "HTML 落过盘"(分不清源变了还是只是重存了一次)。
 * `estimate` 节点**不在**这条门禁里: 它按设计稿只出草稿图, 由调用方读 `sceneStatus().estimated_nodes`
 * 去降档打标; 若在这里拦死, 草稿图也出不来, 与 §4.2 相反。
 */
export function assertFreshForExport(scene: SceneDoc): void {
  if (isStale(scene)) throw new SceneStaleError(scene);
}
