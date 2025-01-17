/** Gnome libs imports */
import * as Clutter from 'clutter';
import * as GObject from 'gobject';
import { registerGObjectClass } from 'src/utils/gjs';
import { InfinityTo0, reparentActor } from 'src/utils/index';

/** Extension imports */
const Me = imports.misc.extensionUtils.getCurrentExtension();

interface TransitionConfig {
    duration: number;
    mode: Clutter.AnimationMode;
    onComplete: () => void;
    translation_y?: number;
    translation_x?: number;
}

@registerGObjectClass
export class TranslationAnimator extends Clutter.Actor {
    static metaInfo: GObject.MetaInfo = {
        GTypeName: 'TranslationAnimator',
        Signals: {
            'transition-completed': {},
        },
    };

    vertical: boolean;
    transitionContainer: Clutter.Actor<
        Clutter.BoxLayout,
        Clutter.ContentPrototype
    >;
    animationInProgress: boolean | undefined;

    constructor(vertical = false) {
        super({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true,
        });

        this.vertical = vertical;
        this.transitionContainer = new Clutter.Actor({
            layout_manager: new Clutter.BoxLayout({
                orientation: this.vertical
                    ? Clutter.Orientation.VERTICAL
                    : Clutter.Orientation.HORIZONTAL,
            }),
        });

        this.add_actor(this.transitionContainer);
    }

    tryRemoveActor(actor: Clutter.Actor) {
        if (this.transitionContainer.get_children().includes(actor)) {
            this.transitionContainer.remove_child(actor);
        }
    }

    /** Starts a transition.
     *
     * Note: The translation animator takes full control over the parenting of the actors until the animation is complete.
     * When calling this function the actors may be parented in arbitrary ways, they will be reparented to the proper state.
     */
    setTranslation(
        initialActors: Clutter.Actor[],
        enteringActors: Clutter.Actor[],
        direction: number
    ): void {
        let translationY = this.transitionContainer.translation_y;
        let translationX = this.transitionContainer.translation_x;

        if (this.animationInProgress) {
            this.transitionContainer.remove_all_transitions();
            this.animationInProgress = false;

            // Remove all clones outside visible area
            const visibleArea = {
                x1: Math.abs(translationX),
                x2: Math.abs(translationX) + this.width,
                y1: Math.abs(translationY),
                y2: Math.abs(translationY) + this.height,
            };

            // Foreach child check if it's in visible bound
            this.transitionContainer.get_children().forEach((actor) => {
                const allocationBox = actor.allocation;
                if (this.vertical) {
                    if (allocationBox.y2 < visibleArea.y1) {
                        this.transitionContainer.remove_actor(actor);
                        translationY =
                            translationY +
                            InfinityTo0(allocationBox.get_height());
                    }
                    if (allocationBox.y1 > visibleArea.y2) {
                        this.transitionContainer.remove_actor(actor);
                    }
                } else {
                    if (allocationBox.x2 < visibleArea.x1) {
                        this.transitionContainer.remove_actor(actor);
                        translationX =
                            translationX +
                            InfinityTo0(allocationBox.get_width());
                    }
                    if (allocationBox.x1 > visibleArea.x2) {
                        this.transitionContainer.remove_actor(actor);
                    }
                }
            });

            for (const actor of initialActors) {
                const p = actor.get_parent();
                if (p !== null && p !== this.transitionContainer) {
                    p.remove_child(actor);
                }
            }
        } else {
            for (const actor of initialActors) {
                reparentActor(actor, this.transitionContainer);
            }
        }

        const children = this.transitionContainer.get_children();
        enteringActors.forEach((actor, index) => {
            // check if the next actor are already in transition
            const nextActorFound = children.includes(actor);
            //insert nextActor Clone at the top pile if direction is positive or at the end if negative
            if (!nextActorFound) {
                reparentActor(actor, this.transitionContainer);
                if (direction < 0) {
                    this.transitionContainer.set_child_at_index(actor, index);
                    if (this.vertical) {
                        translationY -= actor.height;
                    } else {
                        translationX -= actor.width;
                    }
                }
            }
        });
        this.transitionContainer.translation_y = translationY;
        this.transitionContainer.translation_x = translationX;

        //This seem uncessary but it's help to the this.width calculation when the next actor is a placeholder
        this.transitionContainer.set_child_at_index(
            this.transitionContainer.get_child_at_index(0),
            0
        );

        const transitionConfig: TransitionConfig = {
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.endTransition();
            },
        };

        let target = 0;
        if (direction > 0) {
            target = this.vertical
                ? this.transitionContainer.height - this.height
                : this.transitionContainer.width - this.width;
        }

        if (this.vertical) {
            transitionConfig.translation_y = -target;
        } else {
            transitionConfig.translation_x = -target;
        }
        this.animationInProgress = true;
        this.transitionContainer.ease(transitionConfig);
    }

    endTransition(): void {
        this.transitionContainer.translation_x = 0;
        this.transitionContainer.translation_y = 0;
        this.animationInProgress = false;
        this.emit('transition-completed');
        this.transitionContainer.remove_all_children();
    }
}
