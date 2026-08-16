// The code-check engine.
//
// A rule takes the drawing context and returns findings. Four outcomes, and the
// distinction between the last two is the whole point of this feature:
//
//   pass    the drawing demonstrably meets the requirement
//   fail    the drawing demonstrably does not
//   review  the requirement applies but the drawing cannot answer it — the
//           user has to check something the plan does not contain
//   n/a     the requirement does not apply to this project
//
// A tool that turns "review" into "pass" is worse than useless, because it
// tells someone their egress window is fine when nobody has checked the unit.

export const STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  REVIEW: 'review',
  NA: 'n/a',
};

export const SEVERITY = {
  CRITICAL: 'critical', // life safety
  MAJOR: 'major', // will fail inspection
  ADVISORY: 'advisory', // good practice, or a heads-up
};

const STATUS_ORDER = { fail: 0, review: 1, pass: 2, 'n/a': 3 };
const SEVERITY_ORDER = { critical: 0, major: 1, advisory: 2 };

/**
 * @param {object} finding
 *   status, severity, message — what was found
 *   fix — what the user should do about it, in their words not the code's
 *   subject — { type, id, label } the thing it is about, for zooming to it
 */
export function finding(rule, status, message, extra = {}) {
  return {
    ruleId: rule.id,
    title: rule.title,
    citation: rule.citation,
    codeEdition: rule.codeEdition || null,
    sourceUrl: rule.sourceUrl || null,
    verified: rule.verified !== false,
    severity: extra.severity || rule.severity || SEVERITY.MAJOR,
    status,
    message,
    fix: extra.fix || null,
    subject: extra.subject || null,
    measured: extra.measured || null,
    required: extra.required || null,
  };
}

export const pass = (rule, message, extra) => finding(rule, STATUS.PASS, message, extra);
export const fail = (rule, message, extra) => finding(rule, STATUS.FAIL, message, extra);
export const review = (rule, message, extra) => finding(rule, STATUS.REVIEW, message, extra);
export const notApplicable = (rule, message, extra) => finding(rule, STATUS.NA, message, extra);

/**
 * Run a rule set over a context.
 * A rule that throws is reported rather than swallowed — a silent gap in a code
 * check is exactly the failure mode to avoid.
 */
export function runChecks(rules, context) {
  const findings = [];

  for (const rule of rules) {
    try {
      if (rule.applies && !rule.applies(context)) {
        findings.push(notApplicable(rule, rule.notApplicableMessage || 'Does not apply to this project.'));
        continue;
      }
      const produced = rule.check(context) || [];
      findings.push(...(Array.isArray(produced) ? produced : [produced]));
    } catch (err) {
      findings.push(
        finding(rule, STATUS.REVIEW, `This check could not run: ${err.message}`, {
          severity: SEVERITY.ADVISORY,
          fix: 'Check this requirement by hand.',
        })
      );
    }
  }

  findings.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.ruleId.localeCompare(b.ruleId)
  );

  const summary = {
    total: findings.length,
    pass: findings.filter((f) => f.status === STATUS.PASS).length,
    fail: findings.filter((f) => f.status === STATUS.FAIL).length,
    review: findings.filter((f) => f.status === STATUS.REVIEW).length,
    notApplicable: findings.filter((f) => f.status === STATUS.NA).length,
    criticalFailures: findings.filter(
      (f) => f.status === STATUS.FAIL && f.severity === SEVERITY.CRITICAL
    ).length,
    unverifiedRules: findings.filter((f) => !f.verified).length,
  };

  return { findings, summary };
}

/** Group findings for display: failures first, then things needing a look. */
export function groupFindings(findings) {
  return {
    failures: findings.filter((f) => f.status === STATUS.FAIL),
    reviews: findings.filter((f) => f.status === STATUS.REVIEW),
    passes: findings.filter((f) => f.status === STATUS.PASS),
    notApplicable: findings.filter((f) => f.status === STATUS.NA),
  };
}
