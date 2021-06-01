const ENDLINES = /[\r\n]+$/g;
const CURLY = /{{{?\s*([\s\S]*?)\s*}}}?/g;
const ESCAPE = /[&"<]/g, CHARS = {
	'"': '&quot;',
	'&': '&amp;',
	'<': '&lt',
};

// $$1 = escape()
// $$2 = template values
export function gen(input, options) {
	options = options || {};

	let char, num, action, tmp;
	let last = CURLY.lastIndex = 0;
	let wip='', txt='', match, inner;

	let extra = options.extra || {};
	let minify = !!options.minify, stack=[];
	let initials = new Set(options.props || []);

	function close() {
		if (wip.length > 0) {
			txt += (txt ? 'x+=' : '=') + '`' + (minify ? wip.replace(/([\t\s]+(?=<|$)|(\r?\n)+)/g, '') : wip) + '`;';
		} else if (txt.length === 0) {
			txt = '="";'
		}
		wip = '';
	}

	while (match = CURLY.exec(input)) {
		wip += input.substring(last, match.index).replace(ENDLINES, '');
		last = match.index + match[0].length;

		inner = match[1].trim();
		char = inner.charAt(0);

		if (char === '!') {
			// comment, continue
		} else if (char === '#') {
			close();
			[, action, inner] = /^#\s*([a-zA-Z]+)\s*(.*)/.exec(inner);

			if (action === 'expect') {
				inner.trim().split(/[\n\r\s\t]*,[\n\r\s\t]*/g).forEach(key => {
					initials.add(key);
				});
			} else if (action === 'var') {
				num = inner.indexOf('=');
				tmp = inner.substring(0, num++).trim();
				inner = inner.substring(num).trim().replace(/[;]$/, '');
				txt += `var ${tmp}=${inner};`;
			} else if (action === 'each') {
				num = inner.indexOf(' as ');
				stack.push(action);
				if (!~num) {
					txt += `for(var i=0,$$a=${inner.trim()};i<$$a.length;i++){`;
				} else {
					tmp = inner.substring(0, num).trim();
					inner = inner.substring(num + 4).trim();
					let [item, idx='i'] = inner.replace(/[()\s]/g, '').split(','); // (item, idx?)
					txt += `for(var ${idx}=0,${item},$$a=${tmp};${idx}<$$a.length;${idx}++){${item}=$$a[${idx}];`;
				}
			} else if (action === 'if') {
				txt += `if(${inner.trim()}){`;
				stack.push(action);
			} else if (action === 'elif') {
				txt += `}else if(${inner.trim()}){`;
			} else if (action === 'else') {
				txt += `}else{`;
			} else if (tmp = extra[action]) {
				if (inner = tmp(inner, match[0])) {
					if (!inner.endsWith(';')) inner += ';';
					txt += inner;
				}
			} else {
				throw new Error(`Unknown "${action}" block`);
			}
		} else if (char === '/') {
			action = inner.substring(1);
			inner = stack.pop();
			close();
			if (action === inner) txt += '}';
			else if (inner === 'if' && (action === 'else' || action === 'elif')) txt += '}';
			else throw new Error(`Expected to close "${inner}" block; closed "${action}" instead`);
		} else if (match[0].charAt(2) === '{') {
			wip += '${' + inner + '}'; // {{{ raw }}}
		} else {
			wip += '${$$1(' + inner + ')}';
		}
	}

	if (stack.length > 0) {
		throw new Error(`Unterminated "${stack.pop()}" block`);
	}

	if (last < input.length) {
		wip += input.substring(last).replace(ENDLINES, '');
	}

	close();

	tmp = initials.size ? `{${ [...initials].join() }}=$$2,x` : ' x';
	return `var${tmp + txt}return x`;
}

export function esc(value) {
	if (typeof value !== 'string') return value;
	let last=ESCAPE.lastIndex=0, tmp=0, out='';
	while (ESCAPE.test(value)) {
		tmp = ESCAPE.lastIndex - 1;
		out += value.substring(last, tmp) + CHARS[value[tmp]];
		last = tmp + 1;
	}
	return out + value.substring(last);
}