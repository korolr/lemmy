import { Component, linkEvent } from 'inferno';
import { Subscription } from "rxjs";
import { retryWhen, delay, take } from 'rxjs/operators';
import { UserOperation, Community, Post as PostI, GetPostResponse, PostResponse, Comment, CommentForm as CommentFormI, CommentResponse, CommentSortType, CreatePostLikeResponse, CommunityUser, CommunityResponse, CommentNode as CommentNodeI, BanFromCommunityResponse, BanUserResponse, AddModToCommunityResponse, AddAdminResponse, UserView } from '../interfaces';
import { WebSocketService, UserService } from '../services';
import { msgOp, hotRank } from '../utils';
import { PostListing } from './post-listing';
import { Sidebar } from './sidebar';
import { CommentForm } from './comment-form';
import { CommentNodes } from './comment-nodes';
import * as autosize from 'autosize';
import { i18n } from '../i18next';
import { T } from 'inferno-i18next';

interface PostState {
  post: PostI;
  comments: Array<Comment>;
  commentSort: CommentSortType;
  community: Community;
  moderators: Array<CommunityUser>;
  admins: Array<UserView>;
  scrolled?: boolean;
  scrolled_comment_id?: number;
  loading: boolean;
}

export class Post extends Component<any, PostState> {

  private subscription: Subscription;
  private emptyState: PostState = {
    post: null,
    comments: [],
    commentSort: CommentSortType.Hot,
    community: null,
    moderators: [],
    admins: [],
    scrolled: false, 
    loading: true
  }

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;

    let postId = Number(this.props.match.params.id);
    if (this.props.match.params.comment_id) {
      this.state.scrolled_comment_id = this.props.match.params.comment_id;
    }

    this.subscription = WebSocketService.Instance.subject
      .pipe(retryWhen(errors => errors.pipe(delay(3000), take(10))))
      .subscribe(
        (msg) => this.parseMessage(msg),
        (err) => console.error(err),
        () => console.log('complete')
      );

    WebSocketService.Instance.getPost(postId);
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
  }

  componentDidMount() {
    autosize(document.querySelectorAll('textarea'));
  }

  componentDidUpdate(_lastProps: any, lastState: PostState, _snapshot: any) {
    if (this.state.scrolled_comment_id && !this.state.scrolled && lastState.comments.length > 0) {
      var elmnt = document.getElementById(`comment-${this.state.scrolled_comment_id}`);
      elmnt.scrollIntoView(); 
      elmnt.classList.add("mark-two");
      this.state.scrolled = true;
      this.markScrolledAsRead(this.state.scrolled_comment_id);
    }
  }

  markScrolledAsRead(commentId: number) {
    let found = this.state.comments.find(c => c.id == commentId);
    let parent = this.state.comments.find(c => found.parent_id == c.id);
    let parent_user_id = parent ? parent.creator_id : this.state.post.creator_id;

    if (UserService.Instance.user && UserService.Instance.user.id == parent_user_id) {

      let form: CommentFormI = {
        content: found.content,
        edit_id: found.id,
        creator_id: found.creator_id,
        post_id: found.post_id,
        parent_id: found.parent_id,
        read: true,
        auth: null
      };
      WebSocketService.Instance.editComment(form);
    }
  }

  render() {
    return (
      <div class="container">
        {this.state.loading ? 
        <h5><svg class="icon icon-spinner spin"><use xlinkHref="#icon-spinner"></use></svg></h5> : 
        <div class="row">
            <div class="col-12 col-md-8 col-lg-6 mb-3">
              <PostListing 
                post={this.state.post} 
                showBody 
                showCommunity 
                editable 
                moderators={this.state.moderators} 
                admins={this.state.admins}
              />
              <div className="mb-2" />
              <CommentForm postId={this.state.post.id} disabled={this.state.post.locked} />
              {this.sortRadios()}
              {this.commentsTree()}
            </div>
            <div class="col-12 col-md-4 col-lg-3 mb-3 d-none d-md-block px-0">
              {this.state.comments.length > 0 && this.newComments()}
            </div>
            <div class="col-12 col-sm-12 col-lg-3">
              {this.sidebar()}
            </div>
          </div>
        }
      </div>
    )
  }

  sortRadios() {
    return (
      <div class="btn-group btn-group-toggle mb-3">
        <label className={`btn btn-sm btn-secondary pointer ${this.state.commentSort === CommentSortType.Hot && 'active'}`}>{i18n.t('hot')}
          <input type="radio" value={CommentSortType.Hot}
          checked={this.state.commentSort === CommentSortType.Hot} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
        <label className={`btn btn-sm btn-secondary pointer ${this.state.commentSort === CommentSortType.Top && 'active'}`}>{i18n.t('top')}
          <input type="radio" value={CommentSortType.Top}
          checked={this.state.commentSort === CommentSortType.Top} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
        <label className={`btn btn-sm btn-secondary pointer ${this.state.commentSort === CommentSortType.New && 'active'}`}>{i18n.t('new')}
          <input type="radio" value={CommentSortType.New}
          checked={this.state.commentSort === CommentSortType.New} 
          onChange={linkEvent(this, this.handleCommentSortChange)}  />
        </label>
      </div>
    )
  }

  newComments() {
    return (
      <div class="container-fluid sticky-top new-comments">
        <h5><T i18nKey="chat">#</T></h5>
        <CommentForm postId={this.state.post.id} disabled={this.state.post.locked} />
        {this.state.comments.map(comment => 
          <CommentNodes 
            nodes={[{comment: comment}]} 
            noIndent 
            locked={this.state.post.locked} 
            moderators={this.state.moderators} 
            admins={this.state.admins}
          />
        )}
      </div>
    )
  }

  sidebar() {
    return ( 
      <div class="">
        <Sidebar 
          community={this.state.community} 
          moderators={this.state.moderators} 
          admins={this.state.admins}
        />
      </div>
    );
  }
  
  handleCommentSortChange(i: Post, event: any) {
    i.state.commentSort = Number(event.target.value);
    i.setState(i.state);
  }

  private buildCommentsTree(): Array<CommentNodeI> {
    let map = new Map<number, CommentNodeI>();
    for (let comment of this.state.comments) {
      let node: CommentNodeI = {
        comment: comment,
        children: []
      };
      map.set(comment.id, { ...node });
    }
    let tree: Array<CommentNodeI> = [];
    for (let comment of this.state.comments) {
      if( comment.parent_id ) {
        map.get(comment.parent_id).children.push(map.get(comment.id));
      } 
      else {
        tree.push(map.get(comment.id));
      }
    }

    this.sortTree(tree);

    return tree;
  }

  sortTree(tree: Array<CommentNodeI>) {

    if (this.state.commentSort == CommentSortType.Top) {
      tree.sort((a, b) => b.comment.score - a.comment.score);
    } else if (this.state.commentSort == CommentSortType.New) {
      tree.sort((a, b) => b.comment.published.localeCompare(a.comment.published));
    } else if (this.state.commentSort == CommentSortType.Hot) {
      tree.sort((a, b) => hotRank(b.comment) - hotRank(a.comment));
    }

    for (let node of tree) {
      this.sortTree(node.children);
    }

  }

  commentsTree() {
    let nodes = this.buildCommentsTree();
    return (
      <div>
        <CommentNodes 
          nodes={nodes} 
          locked={this.state.post.locked} 
          moderators={this.state.moderators} 
          admins={this.state.admins}
        />
      </div>
    );
  }

  parseMessage(msg: any) {
    console.log(msg);
    let op: UserOperation = msgOp(msg);
    if (msg.error) {
      alert(i18n.t(msg.error));
      return;
    } else if (op == UserOperation.GetPost) {
      let res: GetPostResponse = msg;
      this.state.post = res.post;
      this.state.post = res.post;
      this.state.comments = res.comments;
      this.state.community = res.community;
      this.state.moderators = res.moderators;
      this.state.admins = res.admins;
      this.state.loading = false;
      document.title = `${this.state.post.name} - ${WebSocketService.Instance.site.name}`;
      this.setState(this.state);
    } else if (op == UserOperation.CreateComment) {
      let res: CommentResponse = msg;
      this.state.comments.unshift(res.comment);
      this.setState(this.state);
    } else if (op == UserOperation.EditComment) {
      let res: CommentResponse = msg;
      let found = this.state.comments.find(c => c.id == res.comment.id);
      found.content = res.comment.content;
      found.updated = res.comment.updated;
      found.removed = res.comment.removed;
      found.deleted = res.comment.deleted;
      found.upvotes = res.comment.upvotes;
      found.downvotes = res.comment.downvotes;
      found.score = res.comment.score;
      found.read = res.comment.read;

      this.setState(this.state);
    } else if (op == UserOperation.SaveComment) {
      let res: CommentResponse = msg;
      let found = this.state.comments.find(c => c.id == res.comment.id);
      found.saved = res.comment.saved;
      this.setState(this.state);
    } else if (op == UserOperation.CreateCommentLike) {
      let res: CommentResponse = msg;
      let found: Comment = this.state.comments.find(c => c.id === res.comment.id);
      found.score = res.comment.score;
      found.upvotes = res.comment.upvotes;
      found.downvotes = res.comment.downvotes;
      if (res.comment.my_vote !== null) 
        found.my_vote = res.comment.my_vote;
      this.setState(this.state);
    } else if (op == UserOperation.CreatePostLike) {
      let res: CreatePostLikeResponse = msg;
      this.state.post.my_vote = res.post.my_vote;
      this.state.post.score = res.post.score;
      this.state.post.upvotes = res.post.upvotes;
      this.state.post.downvotes = res.post.downvotes;
      this.setState(this.state);
    } else if (op == UserOperation.EditPost) {
      let res: PostResponse = msg;
      this.state.post = res.post;
      this.setState(this.state);
    } else if (op == UserOperation.SavePost) {
      let res: PostResponse = msg;
      this.state.post = res.post;
      this.setState(this.state);
    } else if (op == UserOperation.EditCommunity) {
      let res: CommunityResponse = msg;
      this.state.community = res.community;
      this.state.post.community_id = res.community.id;
      this.state.post.community_name = res.community.name;
      this.setState(this.state);
    } else if (op == UserOperation.FollowCommunity) {
      let res: CommunityResponse = msg;
      this.state.community.subscribed = res.community.subscribed;
      this.state.community.number_of_subscribers = res.community.number_of_subscribers;
      this.setState(this.state);
    } else if (op == UserOperation.BanFromCommunity) {
      let res: BanFromCommunityResponse = msg;
      this.state.comments.filter(c => c.creator_id == res.user.id)
      .forEach(c => c.banned_from_community = res.banned);
      this.setState(this.state);
    } else if (op == UserOperation.AddModToCommunity) {
      let res: AddModToCommunityResponse = msg;
      this.state.moderators = res.moderators;
      this.setState(this.state);
    } else if (op == UserOperation.BanUser) {
      let res: BanUserResponse = msg;
      this.state.comments.filter(c => c.creator_id == res.user.id)
      .forEach(c => c.banned = res.banned);
      this.setState(this.state);
    } else if (op == UserOperation.AddAdmin) {
      let res: AddAdminResponse = msg;
      this.state.admins = res.admins;
      this.setState(this.state);
    }

  }
}



