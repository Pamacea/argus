# ARGUS Save Skill

> **Skill:** argus-save
> **Purpose:** Save interactions, decisions, and learnings to ARGUS memory
> **Trigger:** "Save to ARGUS", "ARGUS remember", "Log this"

---

## When to Use This Skill

Use this skill to save important information to ARGUS:

1. **After successful solutions** - "This approach worked perfectly"
2. **After failures** - "This didn't work, here's why"
3. **Important decisions** - "We chose X over Y because..."
4. **Code patterns** - "This is a good pattern to reuse"
5. **Debugging discoveries** - "Found the root cause"
6. **Workflows** - "This is the fastest way to do X"

---

## Why Save to ARGUS?

ARGUS memory helps you and your team:
- **Avoid reinventing the wheel** - Reuse proven solutions
- **Avoid repeating mistakes** - Learn from failures
- **Maintain consistency** - Follow established patterns
- **Onboard faster** - Learn from project history
- **Make better decisions** - Understand past rationale

---

## Usage Examples

### Example 1: Save Successful Solution

```
You: This React hook pattern worked really well for the data fetching.

Claude: /argus-save

ARGUS: What should I remember?

You: We successfully implemented data fetching with:
1. TanStack Query for server state
2. Custom hook for encapsulation
3. Proper error handling with retry logic
4. Loading states with skeleton UI

The key insight was keeping the hook focused on a single resource.
This pattern is now our standard for all data fetching.

ARGUS: Saved successfully!
- Category: Solution Pattern
- Tags: react, hooks, data-fetching, tanstack-query
- Confidence: High (successful implementation)
```

---

### Example 2: Save Failure Lesson

```
You: The microservices architecture was a disaster for this project.

Claude: /argus-save

ARGUS: What should I remember?

You: Attempted microservices architecture for this project.
Results:
- Over-engineered for our scale (3 dev team)
- Network latency between services
- Complex deployment pipeline
- Debugging across services was nightmare

Lesson: For projects with < 10 developers and simple requirements,
monolith with modular architecture is better. We spent 70% of time
on infrastructure instead of features.

Reverted to monolith, delivered MVP in 2 weeks vs 3 months.

ARGUS: Saved successfully!
- Category: Architecture Decision (Failure)
- Tags: microservices, architecture, scaling, lessons-learned
- Impact: High (saved 2.5 months)
```

---

### Example 3: Save Debugging Discovery

```
You: Found the bug! It was a race condition in the useEffect cleanup.

Claude: /argus-save

ARGUS: What should I remember?

You: Bug: "Cannot update component after unmount"
Cause: setState in useEffect cleanup without checking mounted status

Solution:
```typescript
useEffect(() => {
  let mounted = true
  fetchData().then(data => {
    if (mounted) setState(data)
  })
  return () => { mounted = false }
}, [])
```

This is a common pattern we should use in ALL async useEffect hooks.

ARGUS: Saved successfully!
- Category: Bug Solution
- Tags: react, useeffect, race-condition, async
- Reusable: Yes (common pattern)
```

---

### Example 4: Save Workflow

```
You: This is the fastest workflow I've found for debugging API issues.

Claude: /argus-save

ARGUS: What should I remember?

You: Debugging Workflow for API Issues:

1. Check API response in Network tab
2. /argus-consult "similar API errors"
3. Check server logs for errors
4. Test endpoint with curl/Postman
5. Check CORS headers
6. Verify auth token is valid
7. Check request payload matches schema

This workflow has saved me hours of debugging time.
Order matters - start with client-side, move to server.

ARGUS: Saved successfully!
- Category: Workflow
- Tags: debugging, api, workflow
- Time Saved: ~2 hours per incident
```

---

## Best Practices

### What to Save

✅ **DO Save:**
- Successful solutions (especially complex ones)
- Failed attempts with lessons learned
- Architecture decisions and rationale
- Bug fixes and root causes
- Performance optimizations
- Security discoveries
- Workflow improvements
- Code review feedback patterns

❌ **DON'T Save:**
- Trivial changes (variable names, formatting)
- Temporary workarounds
- Obvious information (documentation facts)
- Copy-pasted code (use actual files instead)
- Personal opinions without context

### How to Save Effectively

1. **Be specific** - Include exact details
   ```
   ❌ "Fixed auth bug"
   ✅ "Fixed JWT expiration bug by checking token expiry before
      each request and implementing silent refresh"
   ```

2. **Include context** - Why was this decision made?
   ```
   ✅ "Chose SQLite over PostgreSQL because:
      - Single developer project
      - Simpler deployment
      - No concurrent access needed
      - Can migrate later if needed"
   ```

3. **Add tags** - Makes it easier to find later
   ```
   Tags: [authentication, jwt, security, backend]
   ```

4. **Include impact** - How important is this?
   ```
   Impact: Critical - Security vulnerability
   Impact: High - 50% performance improvement
   Impact: Medium - Better UX
   ```

5. **Add code snippets** - When helpful
   ```typescript
   // Use this pattern for all future async hooks
   ```

---

## Categories

ARGUS automatically categorizes saves:

| Category | When to Use | Example |
|----------|-------------|---------|
| **Solution** | Successful implementation | "JWT auth implementation" |
| **Failure** | What didn't work | "Microservices over-engineering" |
| **Decision** | Architectural choices | "PostgreSQL vs MongoDB" |
| **Bug-Fix** | Resolved issues | "Race condition in useEffect" |
| **Performance** | Optimization | "Reduced bundle size by 60%" |
| **Security** | Security findings | "XSS vulnerability in forms" |
| **Workflow** | Process improvements | "Code review checklist" |
| **Pattern** | Reusable code patterns | "Error handling pattern" |

---

## Integration with Workflow

```
┌─────────────────┐
│  Complete Task  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌──────────┐
│Success?│  │ Failure? │
└───┬────┘  └────┬─────┘
    │           │
    ▼           ▼
┌────────┐  ┌──────────┐
│/argus- │  │/argus-   │
│ save   │  │ save     │
└────────┘  └──────────┘
    │           │
    └─────┬─────┘
          ▼
   ┌──────────────────┐
   │ Future Searches  │
   │ Will Find This   │
   └──────────────────┘
```

---

## Technical Details

### MCP Tool Called

```typescript
mcp__argus_save({
  type: "solution" | "failure" | "decision" | "bug-fix" |
        "performance" | "security" | "workflow" | "pattern"

  title: string                 // Brief description
  content: string               // Full details

  context?: {
    tags?: string[]            // For searching
    impact?: "critical" | "high" | "medium" | "low"
    confidence?: number        // 0-1, how sure are we?
    code?: string              // Relevant code snippet
    related?: string[]         // Related files/issues
  }
})
```

### Response Format

```typescript
{
  success: boolean
  savedId: string              // Memory ID
  timestamp: string            // ISO 8601
  category: string
  tags: string[]
}
```

---

## Related Skills

- **argus-consult**: Search ARGUS memory before taking action
- **argus-timeline**: Get context around specific events
- **argus-analyze**: Analyze patterns across all memories

---

## Pro Tips

1. **Save immediately** - Don't wait, details get forgotten
2. **Save failures** - More valuable than successes
3. **Include "why"** - Context is everything
4. **Tag generously** - Helps future searches
5. **Review periodically** - Clean up outdated memories
6. **Share with team** - ARGUS memory is project-wide knowledge

---

## Example Prompts to Use

```
"Save this to ARGUS: The Redux pattern was overkill for our needs.
 Zustand works much better with less boilerplate."

"ARGUS remember: Always check for null before accessing nested
 properties. Use optional chaining (?.) instead."

"Log this: Fixed memory leak by removing event listeners in
 useEffect cleanup. This is now our standard pattern."

"Save to ARGUS: This CSS-in-JS solution is causing performance issues.
 Consider CSS modules or Tailwind instead."
```

---

*Last Updated: 2026-02-21*
