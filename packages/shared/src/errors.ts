/**
 * Core custom error definitions for FlowForge platform operations.
 */

export class WorkflowError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'WORKFLOW_ERROR') {
    super(message);
    this.code = code;
    this.name = 'WorkflowError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WorkflowValidationError extends WorkflowError {
  public readonly issues: Array<{ path: string; message: string }>;

  constructor(message: string, issues: Array<{ path: string; message: string }> = []) {
    super(message, 'VALIDATION_ERROR');
    this.issues = issues;
    this.name = 'WorkflowValidationError';
  }
}

export class WorkflowExecutionError extends WorkflowError {
  public readonly nodeId?: string;

  constructor(message: string, nodeId?: string) {
    super(message, 'EXECUTION_ERROR');
    this.nodeId = nodeId;
    this.name = 'WorkflowExecutionError';
  }
}

export class WorkflowSecurityError extends WorkflowError {
  public readonly reason: string;

  constructor(message: string, reason: string) {
    super(message, 'SECURITY_ERROR');
    this.reason = reason;
    this.name = 'WorkflowSecurityError';
  }
}
