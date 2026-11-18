/**
 * .htaccess → nginx converter (best-effort, with warnings).
 *
 * Converts the common directive families safely and reports anything it
 * cannot translate so the user can review manually:
 *  - RewriteRule (internal rewrites, 301/302 redirects)
 *  - Redirect / RedirectMatch
 *  - <Files>/<FilesMatch> Require all denied / deny from all
 *  - ErrorDocument, DirectoryIndex, Header set, AddDefaultCharset
 *  - Detects the WordPress/Laravel front-controller pattern (already
 *    handled by the panel vhost's try_files) and skips it.
 */

export interface ConvertResult {
  nginx: string
  warnings: string[]
  notes: string[]
}

/** Escape a literal path for use inside an nginx regex */
function reEscape(s: string): string {
  return s.replace(/[.+*?()[\]{}|^$\\]/g, '\\$&')
}

/** Anchor an Apache RewriteRule pattern for nginx (URI has a leading /) */
function anchorPattern(p: string): string {
  if (p.startsWith('^/')) return p
  if (p.startsWith('/')) return `^${p}`
  if (p.startsWith('^')) return `^/${p.slice(1)}`
  return `/${p}`
}

/** Normalize a RewriteRule replacement target for nginx */
function normalizeTarget(t: string): string {
  if (t.startsWith('/') || /^https?:\/\//i.test(t)) return t
  return `/${t}`
}

export function convertHtaccess(source: string): ConvertResult {
  const out: string[] = []
  const warnings: string[] = []
  const notes: string[] = []
  const lines = source.split(/\r?\n/)
  let conds: string[] = []
  let block: { kind: 'files' | 'filesmatch'; arg: string; deny: boolean; other: boolean } | null = null

  const flushBlock = (): void => {
    if (!block) return
    if (block.deny) {
      if (block.kind === 'files') {
        out.push(`location = /${block.arg.replace(/^\//, '')} { deny all; }`)
      } else {
        out.push(`location ~ ${block.arg} { deny all; }`)
      }
    } else if (block.other) {
      warnings.push(`<${block.kind}> block contained unsupported directives — skipped`)
    }
    block = null
  }

  for (const raw of lines) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue

    // ---- block wrappers ----
    if (/^<\/(Files|FilesMatch|IfModule|If)>$/i.test(line)) {
      if (/^<\/(Files|FilesMatch)>$/i.test(line)) flushBlock()
      continue
    }
    if (/^<IfModule/i.test(line)) continue // wrapper only

    let m: RegExpMatchArray | null
    if ((m = line.match(/^<Files\s+"([^"]+)"\s*>$/i))) {
      flushBlock()
      block = { kind: 'files', arg: m[1], deny: false, other: false }
      continue
    }
    if ((m = line.match(/^<FilesMatch\s+"([^"]+)"\s*>$/i))) {
      flushBlock()
      block = { kind: 'filesmatch', arg: m[1], deny: false, other: false }
      continue
    }
    if (block) {
      if (/^(Require\s+all\s+denied|deny\s+from\s+all)$/i.test(line)) {
        block.deny = true
      } else if (!/^(Order|Satisfy)\b/i.test(line)) {
        block.other = true
      }
      continue
    }

    // ---- trivial / no-op directives ----
    if (/^RewriteEngine\s+On$/i.test(line)) continue
    if (/^RewriteBase\s+\S+$/i.test(line)) {
      notes.push('RewriteBase ignored (nginx has no equivalent)')
      continue
    }
    if (/^Options\s+-Indexes$/i.test(line)) {
      notes.push('Directory listing is already off by default in the panel vhost')
      continue
    }
    if (/^(Order|Satisfy)\b/i.test(line)) continue // obsolete Apache 2.2 filler

    // ---- WordPress / Laravel front controller ----
    if ((m = line.match(/^RewriteRule\s+(\S+)\s+(\S+)(?:\s+\[(.*)\])?$/))) {
      const [, pat, tgt, flags = ''] = m
      const simpleFrontController =
        conds.length > 0 &&
        conds.every((c) => /^RewriteCond\s+%\{REQUEST_FILENAME\}\s+!-(f|d)$/i.test(c)) &&
        /^(index\.php|\/index\.php)(\?.*)?$/i.test(tgt)
      if (simpleFrontController) {
        conds = []
        if (!/\?/.test(tgt)) {
          notes.push('Front-controller rewrite (WordPress/Laravel style) already handled by the vhost try_files — the app reads REQUEST_URI — skipped')
          continue
        }
        // Target carries a query (index.php?page=$1): try_files does NOT fill
        // GET params, so emit the faithful nginx equivalent instead.
        out.push(
          '# front controller with path in a GET parameter (try_files does not do this)',
          'if (!-e $request_filename) {',
          `    rewrite ${anchorPattern(pat)} ${normalizeTarget(tgt)} last;`,
          '}',
        )
        notes.push('Front controller with query parameter converted using if (!-e) — mirrors RewriteCond !-f !-d')
        continue
      }
      if (conds.length > 0) {
        warnings.push(`RewriteCond(s) cannot be converted — rule kept WITHOUT its conditions:\n    ${conds.join('\n    ')}`)
        conds = []
      }
      const fl = flags.toUpperCase().split(',').map((f) => f.trim())
      const is301 = fl.some((f) => f === 'R=301' || f === 'R=PERMANENT')
      const is302 = fl.some((f) => f === 'R' || f === 'R=302')
      const external = /^https?:\/\//i.test(tgt)
      let ngFlag = 'last'
      if (is301) ngFlag = 'permanent'
      else if (is302 || (external && !fl.includes('L'))) ngFlag = 'redirect'
      if (fl.includes('NC')) warnings.push('[NC] ignored — nginx rewrite matching is case-sensitive')
      out.push(`rewrite ${anchorPattern(pat)} ${normalizeTarget(tgt)} ${ngFlag};`)
      continue
    }

    if (/^RewriteCond\b/i.test(line)) {
      conds.push(line)
      if (/%[0-9]/.test(line)) warnings.push(`RewriteCond back-reference (%N) not supported: ${line}`)
      continue
    }

    // ---- Redirect / RedirectMatch ----
    if ((m = line.match(/^Redirect(?:Match)?(?:\s+(permanent|temp|301|302|seeother|303))?\s+(\S+)\s+(\S+)$/i))) {
      const status = (m[1] ?? '302').toLowerCase()
      const ngFlag = status === 'permanent' || status === '301' ? 'permanent' : 'redirect'
      const from = m[2]
      const to = m[3]
      if (/^RedirectMatch/i.test(line)) {
        out.push(`rewrite ${anchorPattern(from)} ${normalizeTarget(to)} ${ngFlag};`)
      } else {
        out.push(`rewrite ^${reEscape(from).replace(/^\\\//, '/')}\/?$ ${normalizeTarget(to)} ${ngFlag};`)
      }
      continue
    }

    // ---- simple directives ----
    if ((m = line.match(/^ErrorDocument\s+(\d{3})\s+(\S+)$/i))) {
      out.push(`error_page ${m[1]} ${m[2]};`)
      continue
    }
    if ((m = line.match(/^DirectoryIndex\s+(.+)$/i))) {
      out.push(`index ${m[1].replace(/\s+/g, ' ')};`)
      continue
    }
    if ((m = line.match(/^Header\s+(?:always\s+)?set\s+(\S+)\s+"?([^"]*)"?\s*$/i))) {
      out.push(`add_header ${m[1]} "${m[2]}" always;`)
      continue
    }
    if ((m = line.match(/^AddDefaultCharset\s+(\S+)$/i))) {
      out.push(`charset ${m[1]};`)
      continue
    }

    // ---- known-unsupported families ----
    if (/^(php_value|php_flag|php_admin_value|php_admin_flag)\b/i.test(line)) {
      warnings.push(`${line.split(/\s+/)[0]} cannot live in nginx — configure PHP via the pool or .user.ini instead`)
      continue
    }
    if (/^(AuthType|AuthName|AuthUserFile|AuthGroupFile|Require\s+valid-user|Require\s+user)/i.test(line)) {
      warnings.push('HTTP basic auth directives are not converted (nginx auth_basic needs an htpasswd file)')
      continue
    }
    if (/^(ExpiresActive|ExpiresByType|ExpiresDefault|BrowserMatch|SetEnvIf|RewriteMap|ProxyPass|AddHandler|AddType)\b/i.test(line)) {
      warnings.push(`Unsupported directive skipped: ${line.split(/\s+/)[0]}`)
      continue
    }

    warnings.push(`Unrecognized line skipped: ${line}`)
  }

  flushBlock()
  if (conds.length > 0) warnings.push('Trailing RewriteCond without a RewriteRule — dropped')

  const header = [
    '# converted from .htaccess by panel — review before applying',
    ...(notes.length ? ['# ' + notes.join('; ')] : []),
  ]
  const body = out.length ? out : ['# (nothing convertible was found)']

  return {
    nginx: [...header, ...body, ...(warnings.length ? ['', '# WARNINGS:', ...warnings.map((w) => `# ! ${w.replace(/\n\s+/g, ' ')}`)] : [])].join('\n') + '\n',
    warnings,
    notes,
  }
}
