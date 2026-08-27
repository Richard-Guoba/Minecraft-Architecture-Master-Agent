import { executeError, sanitizeExecuteError } from './contracts.js';

/**
 * Move one already-bound inode without replacement and reconcile the observed
 * source/destination state even when the move primitive throws after taking
 * effect. Callers deliberately receive a sanitized failure for a post-effect
 * throw so their surrounding transaction can roll the observed inode back.
 */
export async function moveIdentityNoReplace({
  ops,
  sourceHandle,
  sourceName,
  destinationHandle,
  destinationName,
  expectedIdentity,
  expectedKind,
  moveForward,
  moveReverse,
  beforeMove = async () => {},
  afterMove = async () => {}
}) {
  await beforeMove();
  const before = await entryDescription(ops, sourceHandle, sourceName);
  if (!before || before.kind !== expectedKind || !sameIdentity(before.identity, expectedIdentity)) {
    throw executeError('P5_INSTALL_FAILED');
  }
  let moveError;
  try {
    await moveForward();
  } catch (error) {
    moveError = error;
  }
  const source = await entryDescription(ops, sourceHandle, sourceName);
  const destination = await entryDescription(ops, destinationHandle, destinationName);
  if (source === null && destination?.kind === expectedKind
    && sameIdentity(destination.identity, expectedIdentity)) {
    await afterMove();
    if (moveError) throw publicError(moveError, 'P5_INSTALL_FAILED');
    return;
  }
  if (source === null && destination) {
    try {
      await moveReverse();
      const restored = await entryDescription(ops, sourceHandle, sourceName);
      const destinationAfter = await entryDescription(ops, destinationHandle, destinationName);
      if (destinationAfter !== null || !restored || restored.kind !== destination.kind
        || !sameIdentity(restored.identity, destination.identity)) {
        throw executeError('P5_INSTALL_FAILED');
      }
    } catch {
      // Preserve an unexpected entry wherever the failed primitive left it.
    }
  }
  throw executeError('P5_INSTALL_FAILED');
}

async function entryDescription(ops, handle, basename) {
  try {
    const stat = await ops.lstat(`/proc/self/fd/${handle.fd}/${basename}`);
    return {
      kind: stat.isSymbolicLink() ? 'symlink'
        : stat.isFile() ? 'file'
          : stat.isDirectory() ? 'directory' : 'other',
      identity: { dev: stat.dev, ino: stat.ino }
    };
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw publicError(error, 'P5_INSTALL_FAILED');
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function publicError(error, fallbackCode) {
  return executeError(sanitizeExecuteError(error, fallbackCode).code);
}
