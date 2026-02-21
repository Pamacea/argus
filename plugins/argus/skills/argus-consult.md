# ARGUS Consult Skill

> **Skill:** argus-consult
> **Purpose:** Consult ARGUS memory before taking action
> **Trigger:** "Consult ARGUS", "Check ARGUS", "Ask ARGUS"

---

## When to Use This Skill

Use this skill BEFORE taking significant actions to:

1. **Check for previous solutions** - "Did we solve this before?"
2. **Validate approach** - "Is this the right way to do X?"
3. **Find similar patterns** - "How did we handle similar situations?"
4. **Avoid mistakes** - "What went wrong last time we tried this?"
5. **Optimize workflow** - "What's the most efficient way to accomplish X?"

---

## How It Works

ARGUS searches your codebase's semantic memory to find:
- Similar problems and their solutions
- Past decisions and rationale
- Common patterns and approaches
- Historical mistakes and how to avoid them

---

## Usage Examples

### Example 1: Before Implementing a Feature

```
You: I need to add authentication to this API route. How should I do it?

Claude: /argus-consult

[ARGUS searches for: "authentication API implementation patterns"]

ARGUS found 3 similar situations from your codebase:

1. users-api/auth/login.ts (Similarity: 92%)
   - Used JWT with httpOnly cookies
   - Implemented refresh token rotation
   - Success: This pattern worked well

2. products-api/auth/middleware.ts (Similarity: 87%)
   - Used API keys with rate limiting
   - Simpler but less secure
   - Note: Only for internal services

3. old-auth-system/ (Similarity: 75%)
   - DEPRECATED: Used session-based auth
   - Abandoned due to scalability issues
   - Warning: Don't use this approach

Recommendation: Follow the pattern from users-api/auth/login.ts
```

---

### Example 2: Before Refactoring

```
You: I want to refactor this component to use hooks instead of HOCs.

Claude: /argus-consult

[ARGUS searches for: "refactor HOC to hooks migration"]

ARGUS found this previous attempt:

Refactor-2024-Q3/UserProfile.tsx (Similarity: 89%)
- Migrated from withUser HOC to useUser hook
- Issue: Lost TypeScript type safety during migration
- Solution: Created proper generic types for hook
- Time spent: 4 hours

Key lessons from previous refactor:
1. Create strict interfaces BEFORE migrating
2. Keep HOC and hook parallel during transition
3. Test thoroughly before removing HOC

Would you like me to follow this approach?
```

---

### Example 3: Debugging

```
You: I'm getting a "Cannot read property of undefined" error in this useEffect.

Claude: /argus-consult

[ARGUS searches for: "useEffect undefined property error"]

ARGUS found 5 similar bugs:

Bug-2024-11-15 #1: Missing dependency array
- Cause: accessing state outside useEffect
- Fix: Add state to dependency array

Bug-2024-10-20 #2: Async race condition
- Cause: setState not checking if component mounted
- Fix: Add cleanup function with mounted flag

Bug-2024-09-08 #3: Undefined initial state
- Cause: useState initialized with undefined
- Fix: useState({}) instead of useState()

Most likely cause for your case: Bug #3 (87% match)
Recommended fix: Initialize state with empty object
```

---

## Best Practices

1. **Always consult ARGUS** before:
   - Major refactors
   - Adding new features
   - Choosing between approaches
   - Debugging complex issues

2. **Be specific** in your query:
   - ✅ "How do I implement JWT auth with refresh tokens?"
   - ❌ "How do I do auth?"

3. **Provide context**:
   - What are you trying to achieve?
   - What constraints do you have?
   - What have you already tried?

4. **Follow recommendations**:
   - ARGUS learns from YOUR past experience
   - It knows what worked in YOUR codebase
   - It remembers YOUR past mistakes

---

## Integration with Workflow

```
┌─────────────────┐
│  Start Task     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ /argus-consult  │ ◀── Check memory first
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Review Results  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────┐  ┌──────────┐
│ Found│  │ Not Found│
│Solution? │
└───┬───┘  └────┬─────┘
    │           │
    ▼           ▼
┌────────┐  ┌──────────┐
│ Apply  │  │Implement │
│Pattern │  │ & Save   │
└────┬───┘  └────┬─────┘
     │           │
     └─────┬─────┘
           ▼
    ┌──────────────┐
    │/argus-save   │ ◀── Save what worked
    └──────────────┘
```

---

## Technical Details

### MCP Tool Called

```typescript
mcp__argus_search({
  query: string              // Your question/situation
  context?: {
    task?: string           // What you're trying to do
    constraints?: string[]  // Any constraints
    previousAttempts?: string[]  // What you've tried
  }
})
```

### Response Format

```typescript
{
  results: Array<{
    similarity: number      // 0-1 score
    source: string          // File/component
    summary: string         // What happened
    outcome: string         // Success/failure
    lessons: string[]       // Key takeaways
    code?: string           // Relevant code snippet
  }>
  recommendation: string     // Best path forward
  confidence: number         // 0-1 score
}
```

---

## Related Skills

- **argus-save**: Save successful patterns to ARGUS memory
- **argus-timeline**: Get context around specific events
- **argus-analyze**: Deep analysis of codebase patterns

---

## Tips for Maximum Effectiveness

1. **Use early and often** - Every consultation adds to knowledge
2. **Save successes** - Use /argus-save when something works well
3. **Save failures** - Even more important to know what didn't work
4. **Be specific** - More context = better recommendations
5. **Trust but verify** - ARGUS suggests, you decide

---

*Last Updated: 2026-02-21*
