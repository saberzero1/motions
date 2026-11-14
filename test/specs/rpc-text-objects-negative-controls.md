# RPC Markdown text-object negative controls

Observed against `test/specs/rpc-text-objects.e2e.ts`; every sabotage was restored before the green run.

| Sabotage                                                                 | Observed failure                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extended `i*`'s exclusive end by one byte                                | RPC `di*` left `***` instead of the fork's `****`; `yi*` included the first closing `*` (`outer *inner* end*` instead of `outer *inner* end`).                                              |
| Removed the companion's `` i` `` / `` a` `` mappings                     | Only inline-code scenarios diverged: `ca\`` consumed the following space, `va\`` selected `` `two` `` plus a space, and `d2i\`` removed the delimiters instead of leaving them.             |
| Forwarded the captured count to native `it` instead of consuming it once | RPC `d2it` selected the outer tag and produced `before <div></div> after`; the fork ignored expansion for its custom object and produced `before <div>outer <span></span> end</div> after`. |
| Put the cursor back where it was after a `y`                             | RPC `yi*` left the cursor on column 17; the fork put it on column 9, where the yanked text starts, as Neovim's `y` does.                                                                    |

Restored result: all 65 parity scenarios pass.
