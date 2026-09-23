# The engine returns typed events and the new World State, never prose

Every engine call returns the new World State and a list of typed events that explain the
change. Turning events into English is a front end's job. We chose this over returning prose
because the game is engine-first and its writing will live in modules and front ends, and over
returning state alone because a diff of two states loses the reason for the change. Events are
also what the History stores and what tests assert on.
