// Genera el APK de Webby y lo guarda en la carpeta APK/ con la fecha en el nombre.
// Uso:  npm run apk
//
// Pasos: compila la web, la copia al proyecto Android y genera el APK con Gradle.
// Necesita Java 21 (C:\Users\Luis\.jdks\jdk-21.*) y el SDK de Android (AppData\Local\Android\Sdk).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function findJava21() {
  if (process.env.JAVA_HOME && /21/.test(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const dir = join(homedir(), '.jdks');
  const jdk = existsSync(dir) ? readdirSync(dir).find((d) => d.startsWith('jdk-21')) : undefined;
  if (!jdk) throw new Error('No encuentro Java 21 en ' + dir + '. Instálalo o define JAVA_HOME.');
  return join(dir, jdk);
}

function run(title, cmd, args, cwd, env = {}) {
  console.log(`\n▶ ${title}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin, env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\n✖ Falló: ${title}`);
    process.exit(r.status ?? 1);
  }
}

const javaHome = findJava21();
const androidHome = process.env.ANDROID_HOME ?? join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');

run('1/3 Compilando la web', 'npx', ['ng', 'build'], root);
run('2/3 Copiando a Android', 'npx', ['cap', 'sync', 'android'], root);
const gradlew = join(root, 'android', isWin ? 'gradlew.bat' : 'gradlew');
run('3/3 Generando el APK', `"${gradlew}"`, ['assembleDebug', '--no-daemon', '-q'], join(root, 'android'), {
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
});

const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = join(root, 'APK');
mkdirSync(outDir, { recursive: true });

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
const fechado = join(outDir, `Webby_${stamp}.apk`);
const ultima = join(outDir, 'Webby-ultima.apk');
copyFileSync(built, fechado);
copyFileSync(built, ultima);

console.log(`\n✔ APK listo:\n   ${ultima}\n   ${fechado}\n`);
