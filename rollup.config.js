import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import {nodeResolve} from '@rollup/plugin-node-resolve';

/* eslint import/no-anonymous-default-export: [2, {"allowObject": true}] */
export default {
	input: './index.js',
	output: [
		{
			file: './index.cjs',
			format: 'cjs',
		},
	],
	plugins: [
		alias({
			entries: [
				{find: 'node:buffer', replacement: 'buffer'},
				{find: 'node:stream', replacement: 'stream'},
				{find: 'node:path', replacement: 'path'},
			],
		}),
		nodeResolve({
			preferBuiltins: true,
		}),
		commonjs({
			strictRequires: 'auto',
		}),
		json(),
	],
};
