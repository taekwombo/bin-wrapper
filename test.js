import {fileURLToPath} from 'node:url';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import nock from 'nock';
import pathExists from 'path-exists';
import rimraf from 'rimraf';
import test from 'ava';
import tempy from 'tempy';
import executable from 'executable';
import {BinWrapper} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rimrafP = promisify(rimraf);
const fixture = path.join.bind(path, __dirname, 'fixtures');

test.beforeEach(() => {
	nock('http://example.com')
		.get('/gifsicle.tar.gz')
		.replyWithFile(200, fixture('gifsicle-' + process.platform + '.tar.gz'))
		.get('/gifsicle-darwin.tar.gz')
		.replyWithFile(200, fixture('gifsicle-darwin.tar.gz'))
		.get('/gifsicle-win32.tar.gz')
		.replyWithFile(200, fixture('gifsicle-win32.tar.gz'))
		.get('/test.js')
		.replyWithFile(200, __filename);
});

test('expose a constructor', t => {
	t.is(typeof BinWrapper, 'function');
});

test('add a source', t => {
	const bin = new BinWrapper().src('http://example.com/bar.tar.gz');
	t.is(bin._src[0].url, 'http://example.com/bar.tar.gz');
});

test('add a source to a specific os', t => {
	const bin = new BinWrapper().src('http://example.com', process.platform);
	t.is(bin._src[0].os, process.platform);
});

test('set destination directory', t => {
	const bin = new BinWrapper().dest(path.join(__dirname, 'foo'));
	t.is(bin._dest, path.join(__dirname, 'foo'));
});

test('set which file to use as the binary', t => {
	const bin = new BinWrapper().use('foo');
	t.is(bin._use, 'foo');
});

test('set a version range to test against', t => {
	const bin = new BinWrapper().version('1.0.0');
	t.is(bin._version, '1.0.0');
});

test('get the binary path', t => {
	const bin = new BinWrapper()
		.dest('tmp')
		.use('foo');

	t.is(bin.path, path.join('tmp', 'foo'));
});

test('verify that a binary is working', async t => {
	const bin = new BinWrapper()
		.src('http://example.com/gifsicle.tar.gz')
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle');

	await bin.run();
	t.true(await pathExists(bin.path));
	await rimrafP(bin.dest());
});

test('meet the desired version', async t => {
	const bin = new BinWrapper()
		.src('http://example.com/gifsicle.tar.gz')
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle')
		.version('>=1.71');

	await bin.run();
	t.true(await pathExists(bin.path));
	await rimrafP(bin.dest());
});

test('download files even if they are not used', async t => {
	const bin = new BinWrapper({strip: 0, skipCheck: true})
		.src('http://example.com/gifsicle-darwin.tar.gz')
		.src('http://example.com/gifsicle-win32.tar.gz')
		.src('http://example.com/test.js')
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle');

	await bin.run();
	const files = await fsPromises.readdir(bin.dest());

	t.is(files.length, 3);
	t.is(files[0], 'gifsicle');
	t.is(files[1], 'gifsicle.exe');
	t.is(files[2], 'test.js');

	await rimrafP(bin.dest());
});

test('skip running binary check', async t => {
	const bin = new BinWrapper({skipCheck: true})
		.src('http://example.com/gifsicle.tar.gz')
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle');

	await bin.run(['--shouldNotFailAnyway']);
	t.true(await pathExists(bin.path));
	await rimrafP(bin.dest());
});

test('error if no binary is found and no source is provided', async t => {
	const bin = new BinWrapper()
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle');

	await t.throwsAsync(
		() => bin.run(),
		{instanceOf: Error},
		'No binary found matching your system. It\'s probably not supported.'
	);
});

test('downloaded files are set to be executable', async t => {
	const bin = new BinWrapper({strip: 0, skipCheck: true})
		.src('http://example.com/gifsicle-darwin.tar.gz')
		.src('http://example.com/gifsicle-win32.tar.gz')
		.src('http://example.com/test.js')
		.dest(tempy.directory())
		.use(process.platform === 'win32' ? 'gifsicle.exe' : 'gifsicle');

	await bin.run();

	const files = await fsPromises.readdir(bin.dest());

	for (const fileName of files) {
		t.true(executable.sync(path.join(bin.dest(), fileName)));
	}
});
