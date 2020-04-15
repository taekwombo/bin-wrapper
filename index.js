'use strict';
const fs = require('fs');
const path = require('path');

const importLazy = require('import-lazy')(require);
const {promisify} = require('util');

const binCheck = importLazy('bin-check');
const binVersionCheck = importLazy('bin-version-check');
const download = importLazy('download');
const osFilterObject = importLazy('os-filter-obj');
const which = importLazy('which');

const statAsync = promisify(fs.stat);
const chmodAsync = promisify(fs.chmod);

/**
 * Initialize a new `BinWrapper`
 *
 * @param {Object} options
 * @api public
 */
module.exports = class BinWrapper {
	constructor(options = {}) {
		this.options = options;

		if (this.options.strip <= 0) {
			this.options.strip = 0;
		} else if (!this.options.strip) {
			this.options.strip = 1;
		}
	}

	/**
	 * Get or set files to download
	 *
	 * @param {String} src
	 * @param {String} os
	 * @param {String} arch
	 * @api public
	 */
	src(src, os, arch) {
		if (arguments.length === 0) {
			return this._src;
		}

		this._src = this._src || [];
		this._src.push({
			url: src,
			os,
			arch
		});

		return this;
	}

	/**
	 * Get or set the destination
	 *
	 * @param {String} dest
	 * @api public
	 */
	dest(dest) {
		if (arguments.length === 0) {
			return this._dest;
		}

		this._dest = dest;
		return this;
	}

	/**
	 * Get or set the binary
	 *
	 * @param {String} bin
	 * @api public
	 */
	use(bin) {
		if (arguments.length === 0) {
			return this._use;
		}

		this._use = bin;
		return this;
	}

	/**
	 * Get or set a semver range to test the binary against
	 *
	 * @param {String} range
	 * @api public
	 */
	version(range) {
		if (arguments.length === 0) {
			return this._version;
		}

		this._version = range;
		return this;
	}

	/**
	 * Get path to the binary
	 *
	 * @api public
	 */
	path() {
		const systemBin = which.sync(this.use(), {nothrow: true});

		if (systemBin) {
			return systemBin;
		}

		return path.join(this.dest(), this.use());
	}

	/**
	 * Run
	 *
	 * @param {Array} cmd
	 * @api public
	 */
	async run(cmd = ['--version']) {
		await this.findExisting();
		if (this.options.skipCheck) {
			return;
		}

		return this.runCheck(cmd);
	}

	/**
	 * Run binary check
	 *
	 * @param {Array} cmd
	 * @api private
	 */
	async runCheck(cmd) {
		const works = await binCheck(this.path(), cmd);
		if (!works) {
			throw new Error(`The \`${this.path()}\` binary doesn't seem to work correctly`);
		}

		if (this.version()) {
			return binVersionCheck(this.path(), this.version());
		}
	}

	/**
	 * Find existing files
	 *
	 * @api private
	 */
	async findExisting() {
		return statAsync(this.path()).catch(error => {
			if (error && error.code === 'ENOENT') {
				return this.download();
			}

			return new Error(error);
		});
	}

	/**
	 * Download files
	 *
	 * @api private
	 */
	async download() {
		const files = osFilterObject(this.src() || []);
		const urls = [];

		if (files.length === 0) {
			throw new Error('No binary found matching your system. It\'s probably not supported.');
		}

		files.forEach(file => urls.push(file.url));

		const result = await Promise.all(urls.map(url => download(url, this.dest(), {
			extract: true,
			strip: this.options.strip
		})));
		const resultingFiles = flatten(result.map((item, index) => {
			if (Array.isArray(item)) {
				return item.map(file => file.path);
			}

			const parsedUrl = new URL(files[index].url);
			const parsedPath = path.parse(parsedUrl.pathname);

			return parsedPath.base;
		}));

		return Promise.all(resultingFiles.map(fileName => {
			return chmodAsync(path.join(this.dest(), fileName), 0o755);
		}));
	}
};

function flatten(array) {
	return array.reduce((acc, element) => {
		if (Array.isArray(element)) {
			acc.push(...element);
		} else {
			acc.push(element);
		}

		return acc;
	}, []);
}
