import { useState, useCallback } from 'react';
import {
  getSchemeEnrollmentDetail,
  getSchemeMaturityBenefit,
  getSchemeForcloseBenefit,
  getSchemeCancellation,
  canMatureEnrollment,
  canForecloseEnrollment,
  getSchemeRules,
} from '@/services/schemeService';

const CALCULATORS = {
  maturity:     getSchemeMaturityBenefit,
  foreclose:    getSchemeForcloseBenefit,
  cancellation: getSchemeCancellation,
};

/**
 * @param {number|null} enrollmentId
 */
export function useSchemeBenefits(enrollmentId) {
  const [kind,      setKind]      = useState(null);   // which one is running/ran
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const reset = useCallback(() => {
    setKind(null); setResult(null); setError(null);
  }, []);

  /**
   * @param {'maturity'|'foreclose'|'cancellation'} which
   */
  const calculate = useCallback(async (which) => {
    if (!enrollmentId) return;
    const fn = CALCULATORS[which];
    if (!fn) return;

    setKind(which); setResult(null); setError(null); setIsLoading(true);
    try {
      const enrollment = await getSchemeEnrollmentDetail(enrollmentId);
      if (!enrollment) throw new Error('Could not load this enrollment.');

      if (which === 'maturity') {
        const { allowed, remaining } = canMatureEnrollment(enrollment);
        if (!allowed) {
          throw new Error(
            `Maturity needs every instalment paid — ${remaining} still outstanding.`,
          );
        }
      }

      if (which === 'foreclose') {
        const schemeRules = await getSchemeRules(enrollment.scheme_id);
        const { allowed, paid, required } = canForecloseEnrollment(enrollment, schemeRules);
        if (!allowed) {
          throw new Error(
            `Foreclosure needs at least ${required} instalments paid — only ${paid} so far.`,
          );
        }
      }

      setResult(await fn(enrollment));
    } catch (e) {
      setError(e?.message || 'Could not calculate. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [enrollmentId]);

  return { calculate, reset, kind, result, error, isLoading };
}
