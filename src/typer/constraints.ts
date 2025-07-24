// LEGACY CONSTRAINT SYSTEM - REMOVED
// This file has been gutted as part of the trait system rewrite
// The old constraint system was complex and conflicted with the new trait system

import { Constraint, Type } from '../ast';

// Keeping minimal exports to prevent compilation errors
// These will be removed once all dependencies are cleaned up

export const satisfiesConstraint = () => false;
export const propagateConstraintToType = () => {};

// Legacy function kept for compatibility - does nothing
export function collectAllConstraintsForVar(): Constraint[] {
	return [];
}

// Legacy function kept for compatibility - does nothing  
export function validateAllSubstitutionConstraints() {
	// Removed - constraint validation is now handled by the new trait system
}