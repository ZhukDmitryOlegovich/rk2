import { readFileSync, writeFileSync } from 'fs';

const PARSE_IS_VARS = /\s*([a-z]+)\s*(,|])/i;

type Vars = Set<string>;

const parseVars = (s: string): Vars => {
	s = s.trim();
	if (!(s.startsWith('[') && s.endsWith(']'))) {
		throw new Error('undefined "[...]" in vars');
	}
	s = s.slice(1);
	const [trash, vars, dots] = s.split(PARSE_IS_VARS).reduce<[string[], string[], string[]]>(
		(accum, v, i) => (accum[i % 3].push(v), accum), [[], [], []],
	);
	// console.log({ trash, vars, dots });
	if (trash.length === 1 && trash[0] === ']') {
		return new Set();
	}
	if (trash.some(Boolean)) {
		throw new Error('find trash in vars');
	}
	if (dots[dots.length - 1] !== ']') {
		throw new Error('undefined "]" in vars');
	}
	dots[dots.length - 1] = ',';
	if (!dots.every((t) => t === ',')) {
		throw new Error('not every ","');
	}
	const res = new Set(vars);
	if (res.size !== vars.length) {
		throw new Error('double var');
	}
	return res;
};

// eslint-disable-next-line no-use-before-define
type Rule = Func | string;

// eslint-disable-next-line no-unused-vars
const ruleToString = (r: Rule): String => (typeof r === 'string' ? r : `${r.name}(${r.args.map(ruleToString).join(',')})`);

type Func = {
	name: string;
	args: Rule[];
}

const PARSE_NAME = /^\s*([a-z]+)\s*(.*)$/i;

const devParseA = (s: string): { ans: Rule, last: string } => {
	// console.log({ s });
	const optName = s.match(PARSE_NAME);
	if (!optName) {
		throw new Error('undefined name');
	}
	const name = optName[1];
	let last = optName[2];
	if (last.length === 0 || !last.startsWith('(')) {
		return { ans: name, last };
	}
	last = last.slice(1);
	const args: Rule[] = [];
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const arg = devParseA(last);
		args.push(arg.ans);
		last = arg.last;
		if (last.startsWith(')')) {
			return { ans: { name, args }, last: last.slice(1) };
		}
		if (!last.startsWith(',')) {
			// console.error({ last });
			throw new Error(`not fount "," - undefined symbol "${last[0]}"`);
		}
		last = last.slice(1);
	}
};

const getAllTerm = (f: Rule): string[] => (
	typeof f === 'string' ? [f] : f.args.flatMap(getAllTerm)
);

const getAllFunc = (f: Rule): Func[] => (
	typeof f === 'string' ? [] : [f].concat(f.args.flatMap(getAllFunc))
);

type Rules = [Rule, Rule][];

// eslint-disable-next-line no-unused-vars
const pairRuleToString = (rr: [Rule, Rule]) => rr.map(ruleToString).join(' -> ');

type FuncsDec = Map<string, number>;

const parseRules = (
	ss: string[], vars: Vars,
): { rules: Rules, funcsDec: Map<string, number> } => {
	const funcsDec: FuncsDec = new Map();

	return {
		rules: ss.map((s) => {
			s = s.trim();
			const param = s.split('->');
			if (param.length !== 2) {
				// console.error({ s, param });
				throw new Error('not one "->"');
			}
			const [left, right] = param;
			const resLeft = devParseA(left.trim());
			if (resLeft.last.length !== 0) {
				// console.error({ s, last: resLeft.last });
				throw new Error('not empty last');
			}
			const resRight = devParseA(right.trim());
			if (resRight.last.length !== 0) {
				// console.error({ s, last: resRight.last });
				throw new Error('not empty last');
			}

			const tLeft = getAllTerm(resLeft.ans);
			const tRight = getAllTerm(resRight.ans);
			const undefVars = tRight.filter((t) => vars.has(t)).filter((t) => !tLeft.includes(t));
			if (undefVars.length !== 0) {
				// console.error({ s, undefVars });
				throw new Error(`vars in right, but not left: ${undefVars}`);
			}

			for (const func of [resLeft.ans, resRight.ans].flatMap(getAllFunc)) {
				const funcDec = funcsDec.get(func.name);
				if (funcDec == null) {
					funcsDec.set(func.name, func.args.length);
				} else if (funcDec !== func.args.length) {
					// console.error({ s, funcName: func.name });
					throw new Error(`incorrect function length: ${func.name}`);
				}
			}

			return [resLeft.ans, resRight.ans];
		}),
		funcsDec,
	};
};

// eslint-disable-next-line no-nested-ternary
const deepEqual = (a: Rule, b: Rule): boolean => (typeof a === 'string'
	? (typeof b === 'string'
		? a === b
		: false)
	: (typeof b === 'string'
		? false
		: a.name === b.name && a.args.every(
			(_, i) => deepEqual(a.args[i], b.args[i]),
		)));

// const deepCopy = (a: Rule): Rule => (typeof a === 'string'
// 	? a
// 	: { name: a.name, args: a.args.map(deepCopy) });

type Checker = (rules: Rules, vars: Vars, funcsDec: FuncsDec) => boolean | null;

const CHECKERS: readonly Checker[] = [
	/**
	 * Проверям, что терм "вылазиет" [s: a(s_1(x)) -> s_0(a(x))]
	 * или "пропадает" [s: a(s_1(x)) -> {s_null} a(x)]
	 */
	(rules, vars, funcsDec) => {
		const getaAllDepthFunc = (f: Rule, name: string, depth = 0): number[] => (
			typeof f === 'string'
				? []
				: (f.name === name
					? [depth]
					: []
				).concat(f.args.flatMap((nf) => getaAllDepthFunc(nf, name, depth + 1)))
		);

		return Array.from(funcsDec.keys()).some(
			(name) => rules.every(
				([left, right]) => {
					const leftDepth = getaAllDepthFunc(left, name);
					const rightDepth = getaAllDepthFunc(right, name);
					if (leftDepth.length === 0 || leftDepth.length < rightDepth.length) {
						return false;
					}
					let findMore = false;
					for (let i = 0; i < leftDepth.length; i++) {
						switch (Math.sign(rightDepth[i] - leftDepth[i])) {
							case -1: findMore = true; break;
							case 1: return false;
							case 0: default: break;
						}
					}
					return findMore || leftDepth.length > rightDepth.length;
				},
			),
		) || null;
	},
	/**
	 * Проверям, что все правила "укорачиваются" [{3} f_1(g_2(x), g_3(x)) -> {1} h_1(x)]
	 */
	(rules, vars, funcsDec) => rules.every(
		([left, right]) => getAllFunc(left).length > getAllFunc(right).length,
	) || null,
	/**
	 * Существует правило порождающее "само себя" [g(x) -> {g(x)} h(f(H, g(x)))]
	 * и
	 * Добавляем к оригинальным правилам их "потомков" (n раз):
	 * [f(x,x) -> f(g(x),x)]
	 * [g(h(E)) -> h(E)]
	 * =>
	 * [f(h(E),h(E)) -> f(h(E),h(E))]
	 */
	(rules, vars, funcsDec) => {
		let allRuleByFuncName = rules.reduce<Record<string, [Rule, Rule][] | undefined>>( // ! TODO: var first
			// eslint-disable-next-line no-return-assign
			(map, rule) => ((map[(rule[0] as Func).name] ??= []).push(rule), map), {},
		);

		const setNewVars = (
			v: string, r: Rule, useVars: Record<string, Rule>,
			deepCheck: boolean, fromLeft = true,
		) => {
			if (v === r) return true;
			if (deepCheck && fromLeft && getAllTerm(r).includes(v)) {
				// console.log([ruleToString(r), getAllTerm(r), deepCheck, fromLeft]);
				return false;
			}
			if (!useVars[v]) {
				useVars[v] = r;
			} else if (!deepEqual(useVars[v], r)) {
				return false;
			}
			return true;
		};

		const deepEqualWithVars = (
			a: Rule, b: Rule, useVars: Record<string, Rule>, deepCheck = false,
		): boolean => {
			if (typeof a === 'string') {
				if (vars.has(a)) {
					return setNewVars(a, b, useVars, deepCheck);
				}
				if (typeof b === 'string' && vars.has(b)) {
					return setNewVars(b, a, useVars, deepCheck);
				}
				return a === b;
			}
			if (typeof b === 'string') {
				return vars.has(b) && setNewVars(b, a, useVars, deepCheck, false);
			}
			return a.name === b.name && a.args.every(
				(_, i) => deepEqualWithVars(a.args[i], b.args[i], useVars, deepCheck),
			);
		};

		// eslint-disable-next-line no-nested-ternary
		const replaceVars = (a: Rule, useVars: Record<string, Rule>): Rule => (typeof a === 'string'
			? (useVars[a] ? useVars[a] : a)
			: { name: a.name, args: a.args.map((arg) => replaceVars(arg, useVars)) });

		// eslint-disable-next-line no-nested-ternary
		const replaceRule = (a: Rule, equal: Rule, replace: Rule): Rule => (deepEqual(a, equal)
			? replace
			: (typeof a === 'string'
				? a
				: { name: a.name, args: a.args.map((arg) => replaceRule(arg, equal, replace)) }));

		const checkSomeRuleCallback = (a: Rule, callback: (v: Rule) => boolean) => (
			callback(a) || (typeof a !== 'string' && a.args.some(callback))
		);

		let appendRules: Rules = [];
		let lastIteration = rules;
		const n = 2;
		for (let i = 0; i < n; i++) {
			// console.log(lastIteration.map(pairRuleToString));
			if (lastIteration.some(
				([left, right]) => checkSomeRuleCallback(right,
					(v) => (
						// console.log({ v___: ruleToString(v), left: ruleToString(left) }),
						deepEqualWithVars(v, left, {}, true))),
			)) return false;
			// eslint-disable-next-line no-loop-func
			lastIteration = lastIteration.flatMap((rule) => getAllFunc(rule[1])
				.flatMap((rep) => (allRuleByFuncName[rep.name] ?? [])
					.flatMap((rule2) => {
						const useVars: Record<string, Rule> = {};
						if (!deepEqualWithVars(rule2[0], rep, useVars)) {
							return [];
						}
						return [rule.map((r) => replaceRule(
							replaceVars(r, useVars),
							replaceVars(rep, useVars),
							replaceVars(rule2[1], useVars),
						)) as [Rule, Rule]];
					})));
			allRuleByFuncName = lastIteration.reduce<Record<string, [Rule, Rule][] | undefined>>( // ! TODO: var first
				// eslint-disable-next-line no-return-assign
				(map, rule) => ((map[(rule[0] as Func).name] ??= []).push(rule), map),
				allRuleByFuncName,
			);
			appendRules = appendRules.concat(lastIteration);
		}

		rules.push(...appendRules);

		// console.log(appendRules.map(pairRuleToString));

		return null;
	},
] as const;

const parseAll = (s: string) => {
	const lines = s.trim().split(/\s*\r?\n\s*/).filter(Boolean);
	// console.log({lines});
	const vars = parseVars(lines.shift()!);
	return { vars, ...parseRules(lines, vars) };
};

const printAns = (type: boolean | null | Error) => {
	let res;
	switch (type) {
		case null:
			res = 'Unknown';
			res = 'True';
			break;
		case true: res = 'True'; break;
		case false: res = 'False'; break;
		default: res = 'Syntax error';
	}
	process.stdout.write(res);
	writeFileSync('result', res);
};

// const readFileSync = (...a: any) => `
// [x,y,z,w]
// f(x,y,z,w) -> f(y,x,y,x)
// g(h(x,y)) -> h(g(x),g(y))
// g(x) -> x
// `;

// eslint-disable-next-line no-void
// const writeFileSync = (...a: any) => void 0;

const main = (): void => {
	try {
		const { rules, vars, funcsDec } = parseAll(
			readFileSync('test.trs', { encoding: 'utf8' }),
		);

		// console.dir({ rules: rules.map(pairRuleToString), vars, funcsDec }, { depth: null });
		// console.log(
		// 	CHECKERS.map((checker) => checker(rules, vars, funcsDec)),
		// );

		for (const checker of CHECKERS) {
			const res = checker(rules, vars, funcsDec);
			if (typeof res === 'boolean') {
				printAns(res);
				return;
			}
		}

		printAns(null);
	} catch (error) {
		printAns(error as Error);
	}
};

// console.time('main');
main();
// console.timeEnd('main');

// const { funcsDec, rules, vars } = parseAll(`
// []
// f(H,g(D))->E
// g(D)->f(D,D)
// g(g(E))->f(g(E),E)
// g(g(g(E)))->g(E)

// `);

// console.log(
// 	CHECKERS.map((checker) => checker(rules, vars, funcsDec)),
// );
