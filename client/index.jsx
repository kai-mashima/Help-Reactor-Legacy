import React from 'react';
import ReactDOM from 'react-dom';
import io from 'socket.io-client';
import TicketList from './components/ticketList.jsx';
import TicketSubmission from './components/ticketSubmission.jsx';
import Login from './components/login.jsx';
import Alert from './components/alert.jsx';
import Nav from './components/nav.jsx';
import Header from './components/header.jsx';
import AdminDashboard from './components/adminDashboard.jsx';
import Modal from 'react-bootstrap/lib/Modal';
import Button from 'react-bootstrap/lib/Button';
import SetCamera from './components/Camera.jsx';

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      // users: [],
      showVideoModal: false,
      ticketList: [],
      ticketCategoryList: ['React', 'Socket.IO', 'Recursion', 'Postgres'],
      user: null,
      isAuthenticated: false,
      caller: {},
      onlineUsers: {},
      onlineUserInfo: [],
      statistic: {},
      waitTime: 0,
      mentorResponse: [],
      mentorResolution: [],
    };
    window.navigator.getUserMedia = window.navigator.getUserMedia ||
    window.navigator.webkitGetUserMedia || window.navigator.mozGetUserMedia;
  }

  componentWillMount() {
    $.ajax({
      url: '/api/users/:id',
      type: 'GET',
      async: false,
      success: (response) => {
        if (response.user) {
          this.setState({
            user: response.user,
            isAuthenticated: true
          });
        } else if (response) {
          this.setState({ user: response });
        }
      },
      error: () => {
        console.log('failed');
      }
    });
  }

  componentDidMount() {
    if (!this.state.user) { return; }

    let option = {
      // users: this.state.users,
      id: this.state.user.id,
      role: this.state.user.role,
      username: this.state.user.username,
      firstName: this.state.user.firstName,
      lastName: this.state.user.lastName,
      cohort: this.state.user.cohort,
      ticketsPerDay: this.state.user.ticketsPerDay,
      avatarUrl: this.state.user.avatarUrl
    };

    this.socket = io({ query: option });
    this.socket.emit('update adminStats');
    this.socket.emit('get mentor response time');
    this.socket.emit('get mentor resolution time');

    this.socket.on('update or submit ticket', () => {
      return option.role === 'admin' ? this.filterTickets() : this.getTickets(option);
    });

    this.socket.on('new adminStats', data => this.setState({ statistic: data }));

    this.socket.on('new wait time', data => this.setState({ waitTime: data.waitTime }));

    this.socket.on('user connect', data => this.setState({ onlineUsers: data }));

    this.socket.on('user disconnect', data => this.setState({ onlineUsers: data }));

    this.socket.on('online info', data => this.setState({onlineUserInfo: data}));

    this.socket.on('new mentor response time', data => this.setState({ mentorResponse: data.data}));

    this.socket.on('new mentor resolution time', data => this.setState({ mentorResolution: data.data}));

    this.socket.on('call request', data => {
      this.setState({ 
        caller: data,
        showVideoModal: true
      });
      SetCamera((stream) => {
        this.socket.emit('answer request', stream);
      });
    });



    this.socket.on('new tickets per day', data => this.setState({ ticketsPerDay: data }))

    this.getTickets(option);

    this.socket.emit('update tickets per day for every user');
  }

  getTickets(option) {
    $.get('/api/tickets', option, (tickets) => {
      this.setState({ ticketList: tickets });
      this.hasClaimed(this.state.user.id);
    });
  }

  submitTickets(e) {
    $('.ticket_submission_form').validate({
      rules: {
        category: 'required',
        location: 'required',
        description: 'required'
      },
      submitHandler: (form) => {
        let ticket = {
          userId: this.state.user.id,
          category: document.getElementById('ticket_submission_category').value,
          location: document.getElementById('ticket_submission_location').value,
          description: document.getElementById('ticket_submission_description').value,
          status: 'Opened'
        };
        $.ajax({
          url: '/api/tickets',
          type: 'POST',
          data: ticket,
          success: (response) => {
            this.socket.emit('refresh');
            this.socket.emit('update adminStats');
            this.socket.emit('update tickets per day', this.state.user);
            document.getElementById('ticket_submission_location').value = '';
            document.getElementById('ticket_submission_description').value = '';
          },
          error: () => {
            console.log('Error submitting ticket');
          }
        });
      },
      errorPlacement: function(error, element) {} // Do not show error messages
    });
  }

  getOnlineUsers(userType) {
    this.socket.emit('get online users', userType);
  }

  handleCall(user, stream) {
    this.socket.emit('call user', {user, stream});
  }

  updateTickets(data) {
    if (data.status === 'Claimed') {
      data.claimedBy = this.state.user.id;
    }

    $.ajax({
      url: `/api/tickets/${data.id}`,
      type: 'PUT',
      data: data,
      success: (response) => {
        this.socket.emit('refresh');
        this.socket.emit('update adminStats');
        this.socket.emit('get wait time');
      },
      error: (err) => {
        console.log('failed to update ticket');
      }
    });
  }

  filterTickets(e) {
    if (e) { e.preventDefault(); }
    let day = document.getElementById('time-window').value;
    let category = document.getElementById('select-category').value;
    let status = document.getElementById('ticket-status').value;
    let type = 'createdAt';

    let timeWindow = day === 'All' ? { $not: 0 }
      : { $gte: new Date(new Date() - day * 24 * 60 * 60 * 1000) };
    if (category === 'All') { category = { $not: null }; }
    if (status === 'All') {
      status = { $not: null };
    } else if (status === 'Closed') {
      type = 'closedAt';
    } else if (status === 'Claimed') {
      type = 'claimedAt';
    }
    let option = {
      id: this.state.user.id,
      role: this.state.user.role,
      category: category,
      status: status,
      [type]: timeWindow
    };

    this.getTickets(option);
  }

  hasClaimed(id) {
    // need to fix this
    const ticketList = this.state.ticketList;
    for (let i = 0; i < ticketList.length; i++) {
      if (ticketList[i].status !== 'Claimed') { break; }
      if (ticketList[i].status === 'Claimed' && ticketList[i].claimedBy === id) {
        return $('.claim_btn').prop('disabled', true);
      }
    }
    return $('.claim_btn').prop('disabled', false);
  }

  closeVideoModal() {
    this.setState({
      showVideoModal: false
    });
  }

  openVideoModal() {
    this.setState({
      showVideoModal: true
    });
  }

  render() {
    let user = this.state.user;
    let isAuthenticated = this.state.isAuthenticated;
    let nav = null;
    let header = null;
    let main = null;
    let list = null;
    let videoModal = null;
    let modalButton = null;

    if (isAuthenticated) {
      nav = <Nav user={this.state.user} />;

      videoModal = <Modal
          show={this.state.showVideoModal}
          onHide={this.closeVideoModal}
          bsSize='lg'>
          <Modal.Header closeButton>
            <Modal.Title>Incoming Video Call</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              Video Here
          </Modal.Body>
          <Modal.Footer>
            <Button>Accept</Button>
            <Button onClick={this.closeVideoModal.bind(this)}>Decline</Button>
          </Modal.Footer>
        </Modal>;

      modalButton = <Button
          bsStyle="primary"
          bsSize="large"
          onClick={this.openVideoModal.bind(this)}>
          Test Modal
        </Button>;

      header = <Header
        handleCall={this.handleCall.bind(this)}
        getOnlineUsers={this.getOnlineUsers.bind(this)}
        statistic={this.state.statistic}
        onlineUsers={this.state.onlineUsers}
        onlineUserInfo={this.state.onlineUserInfo}
        user={this.state.user}
        waitTime={this.state.waitTime}
        mentorResponseTime={this.state.mentorResponse}
        mentorResolutionTime={this.state.mentorResolution}
        user={this.state.user}
        waitTime={this.state.waitTime}/>;
      list = <TicketList user={this.state.user} ticketList={this.state.ticketList} updateTickets={this.updateTickets.bind(this)} hasClaimed={this.state.hasClaimed} ticketsPerDay={this.state.ticketsPerDay} />;
    }

    if (!isAuthenticated) {
      document.querySelector('BODY').style.backgroundColor = '#2b3d51';
      main = <Login />;
    } else if (isAuthenticated && user.role === 'student') {
      main = <TicketSubmission submitTickets={this.submitTickets.bind(this)} ticketCategoryList={this.state.ticketCategoryList} />;
    } else if (isAuthenticated && user.role === 'mentor') {
      // reserved for mentor view
    } else if (isAuthenticated && user.role === 'admin') {
      main = <AdminDashboard filterTickets={this.filterTickets.bind(this)} onlineUsers={this.state.onlineUsers} adminStats={this.state.statistic} ticketCategoryList={this.state.ticketCategoryList} />;
    }

    return (
      <div>
        <Alert />
        {nav}
        {modalButton}
        {videoModal}
        {header}
        <div className="container">
          {main}
          {list}
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('app'));
